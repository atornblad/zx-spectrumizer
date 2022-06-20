const onlyAscii = (str) => str.replace(/[^\x20-\x7e]/g, '');

function getZXSpectrumSafeString(str, maxLength, valueIfEmpty) {
    str = onlyAscii(str);
    if (str.length === 0) {
        str = valueIfEmpty;
    }
    if (str.length > maxLength) {
        str = str.substring(0, maxLength);
    }
    return str;
}

function copyZXSpectrumString(memory, offset, str, maxLength, padding) {
    str = str.padEnd(maxLength, padding);

    for (let i = 0; i < maxLength; ++i) {
        memory[offset + i] = i < str.length ? str.charCodeAt(i) : (padding || 0);
    }
}

const xorBytes = (memory, start, length) => {
    let xor = 0;
    for (let i = start; i < start + length; i++) {
        xor ^= memory[i];
    }
    return xor;
};

function generateTap(filename, memory) {
    const file = new Uint8ClampedArray(2 + 19 + 2 + 2 + memory.length);
    file[0] = 19;   // First block size (two positions)
    file[1] = 0;
    file[2] = 0;    // Header
    file[3] = 3;    // Code
    copyZXSpectrumString(file, 4, filename, 10, ' ');
    file[14] = MEMORY_SIZE & 255;
    file[15] = MEMORY_SIZE >> 8;
    file[16] = 0;
    file[17] = (16384 >> 8);
    file[18] = 0;
    file[19] = 0x80;
    file[20] = xorBytes(file, 2, 19);
    file[21] = (MEMORY_SIZE + 2) & 255;
    file[22] = (MEMORY_SIZE + 2) >> 8;
    file[23] = 0xff;    // Data
    for (let i = 0; i < MEMORY_SIZE; i++) {
        file[24 + i] = memory[i];
    }
    file[24 + MEMORY_SIZE] = xorBytes(file, 23, MEMORY_SIZE + 1);
    return file;
}