
const MEMORY_SIZE = 192 * 32 + 24 * 32;
const memory = new Uint8ClampedArray(MEMORY_SIZE);
let latestSource = null;
let clipboardBlob = null;

const range = function* (start, count) {
    for (let i = start; i < start + count; i++) {
        yield i;
    }
}

const arrange = (start, count) => Array.from(range(start, count));

const color = (i) => {
    const high = i <= 7 ? 208 : 255;
    return { i : i, b : (i & 1) ? high : 0, r : (i & 2) ? high : 0, g : (i & 4) ? high : 0 };
}

const css = ({r,g,b}) => `rgb(${r},${g},${b})`;

const colors = arrange(0, 16).map(color);

const closestColor = (r, g, b, cols) => {
    const colors_used = cols ?? colors;
    const distance = (c) => Math.sqrt(Math.pow(c.r - r, 2) + Math.pow(c.g - g, 2) + Math.pow(c.b - b, 2));
    return colors_used.reduce((a, b) => distance(a) <= distance(b) ? a : b);
};

document.addEventListener('DOMContentLoaded', () => {

    const canvas = document.querySelector('canvas');
    const context = canvas.getContext('2d');
    const fileLabel = document.getElementById('file-label');
    const fileInput = document.getElementById('file');
    const ditherInput = document.getElementById('dither');
    const saveTapButton = document.getElementById('save-tap');
    const playSoundButton = document.getElementById('play-sound');

    const MAX_WIDTH = 256;
    const MAX_HEIGHT = 192;
    const CANVAS_WIDTH = canvas.width;
    const CANVAS_HEIGHT = canvas.height;
    const LEFT = (CANVAS_WIDTH - MAX_WIDTH) / 2;
    const TOP = (CANVAS_HEIGHT - MAX_HEIGHT) / 2;
    let audioPlaying = false;

    let filename = '';

    const drawBorder = (colors) => {
        for (let y = 0; y < CANVAS_HEIGHT; ++y) {
            context.fillStyle = css(color(colors[y]));
            if (y < TOP || y >= TOP + MAX_HEIGHT) {
                context.fillRect(0, y, CANVAS_WIDTH, 1);
            }
            else {
                context.fillRect(0, y, LEFT, 1);
                context.fillRect(LEFT + MAX_WIDTH, y, LEFT, 1);
            }
        }
    }

    playSoundButton.addEventListener('click', async () => {
        if (audioPlaying) return;
        audioPlaying = true;
        const tap = generateTap(filename, memory);
        const audio = new AudioContext();
        await audio.audioWorklet.addModule('save-to-tape.js');
        const processor = new AudioWorkletNode(audio, 'save-to-tape');
        processor.port.onmessage = (e) => {
            if (e.data === 'done') {
                window.setTimeout(() => {
                    audioPlaying = false;
                    audio.close();
                }, 500);
            }
            else {
                drawBorder(e.data);
            }
        }
        processor.port.postMessage(tap);
        processor.connect(audio.destination);
    });

    saveTapButton.addEventListener('click', () => {
        const file = generateTap(filename, memory);
        const blob = new Blob([file], {type: 'application/x-tap'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.tap`;
        a.click();
        URL.revokeObjectURL(url);
    });

    const imageOnload = (image, dither, filename) => {
        context.fillStyle = css(color(7));
        context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        context.fillStyle = '#000';
        context.fillRect(LEFT, TOP, MAX_WIDTH, MAX_HEIGHT);

        saveTapButton.value = `💾 Save to ${filename}.TAP`;
        playSoundButton.value = `🔊 SAVE "${filename}" SCREEN$`;

        let left = LEFT, top = TOP, width = MAX_WIDTH, height = MAX_HEIGHT;
        if (image.width / image.height > MAX_WIDTH / MAX_HEIGHT) {
            height = Math.floor(image.height * MAX_WIDTH / image.width);
            top = Math.floor((CANVAS_HEIGHT - height) / 2);
        }
        else {
            width = Math.floor(image.width * MAX_HEIGHT / image.height);
            left = Math.floor((CANVAS_WIDTH - width) / 2);
        }
        context.drawImage(image, left, top, width, height);

        const imageData = context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        for (let by = TOP; by < (TOP + MAX_HEIGHT); by += 8) {
            const blockTopLine = by - TOP;
            const blockTop = blockTopLine / 8;

            for (let bx = LEFT; bx < (LEFT + MAX_WIDTH); bx += 8) {
                const blockLeft = (bx - LEFT) / 8;
                const colorsByIndex = arrange(0, 16).map(i => 0);

                // Which colors are used in this block?
                for (let y = by; y < (by + 8); y++) {
                    for (let x = bx; x < (bx + 8); x++) {
                        const index = (y * CANVAS_WIDTH + x) * 4;
                        const color = closestColor(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]);
                        colorsByIndex[color.i]++;
                    }
                }

                // Are there more bright colors than dark colors?
                const darkPixels = Array.from(range(1,7)).map(i => colorsByIndex[i]).reduce((a, b) => a + b);
                const brightPixels = Array.from(range(9,7)).map(i => colorsByIndex[i]).reduce((a, b) => a + b);
                const bright = brightPixels > darkPixels;

                const localColors = bright ? colors.slice(8, 16) : colors.slice(0, 8);

                // Which colors are used in this block?
                const localColorsByIndex = arrange(0, 8).map(i => ({i : localColors[i].i, count : 0}));
                for (let y = by; y < (by + 8); y++) {
                    for (let x = bx; x < (bx + 8); x++) {
                        const index = (y * CANVAS_WIDTH + x) * 4;
                        const color = closestColor(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2], localColors);
                        localColorsByIndex[color.i & 7].count++;
                    }
                }
                localColorsByIndex.sort((a, b) => b.count - a.count);

                const blockColors = [colors[localColorsByIndex[0].i], colors[localColorsByIndex[1].i]];

                // Draw the block
                const attrAddress = 32 * 192 + blockTop * 32 + blockLeft;

                // The most common should be the "zero" bit (the PAPER color)
                const paper = blockColors[0].i;
                const ink = blockColors[1].i;

                const attr = (bright ? 0x40 : 0) | ((paper & 0x07) << 3) | (ink & 0x07);
                memory[attrAddress] = attr;

                for (let y = by; y < (by + 8); y++) {
                    const line = blockTopLine + (y - by);
                    const lineAddress = (line & 0xc0) << 5 | (line & 0x07) << 8 | (line & 0x38) << 2;
                    const bitsAddress = lineAddress + blockLeft;

                    let bits = 0;
                    for (let x = bx; x < (bx + 8); x++) {
                        const index = (y * CANVAS_WIDTH + x) * 4;
                        const r = imageData.data[index];
                        const g = imageData.data[index + 1];
                        const b = imageData.data[index + 2];
                        const color = closestColor(r, g, b, blockColors);
                        if (color.i == ink) {
                            bits |= 1 << (7 - (x - bx));
                        }
                        if (dither) {
                            const dr = r - color.r;
                            const dg = g - color.g;
                            const db = b - color.b;
                            if (x < LEFT + MAX_WIDTH - 1) {
                                imageData.data[index + 4] += (dr / 4);
                                imageData.data[index + 5] += (dg / 4);
                                imageData.data[index + 6] += (db / 4);
                            }
                        }
                        imageData.data[index] = color.r;
                        imageData.data[index + 1] = color.g;
                        imageData.data[index + 2] = color.b;
                    }
                    memory[bitsAddress] = bits;
                }
                context.putImageData(imageData, 0, 0);
            }
        }
    };

    const handleFileInput = () => {
        const file = fileInput.files[0];
        filename = getZXSpectrumSafeString(file.name, 10, 'image');
        if (filename.indexOf('.') > 0) {
            filename = filename.substring(0, filename.indexOf('.'));
        }
        const image = new Image;
        image.onload = () => imageOnload(image, ditherInput.checked, filename);
        image.src = URL.createObjectURL(fileInput.files[0]);
    };

    const handleClipboardInput = () => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const image = new Image();
            image.onload = () => imageOnload(image, ditherInput.checked, 'clipboard');
            image.src = e.target.result;
        }
        reader.readAsDataURL(clipboardBlob);
    };

    if ('capture' in fileInput) {
        fileLabel.textContent = '📷 Take a picture';
    }

    fileInput.addEventListener('change', () => {
        latestSource = 'file';
        handleFileInput();
    });

    ditherInput.addEventListener('change', () => {
        if (latestSource === 'file' && fileInput.files.length >= 1) {
            handleFileInput();
        }
        else if (latestSource === 'clipboard' && clipboardBlob) {
            handleClipboardInput();
        }
    });

    document.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        for (let item of items) {
            // Get image as data url
            if (item.type.indexOf('image') !== -1) {
                clipboardBlob = item.getAsFile();
                latestSource = 'clipboard';
                fileInput.value = null;
                filename = 'clipboard';
                handleClipboardInput();
                break;
            }
        };
    });
});
