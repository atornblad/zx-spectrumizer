// Source: https://worldofspectrum.org/faq/reference/48kreference.htm#TapeDataStructure

const TSTATES_PER_SAMPLE = 3500000 / 48000;
const PAUSE_TSTATES = 3500000;
const LEAD_TSTATES = 2168;
const SYNC1_TSTATES = 667;
const SYNC2_TSTATES = 735;
const SET_BIT_TSTATES = 1710;
const RESET_BIT_TSTATES = 855;
const HEADER_LEAD_PULSES = 8063;
const DATA_LEAD_PULSES = 3223;

const border = new Uint8ClampedArray(256);
let borderIndex = 0;
let borderTStates = 0;
let postBorder = false;
const BORDER_LINE_TSTATES = 224;
const BORDER_LINES_PER_FRAME = 312;

const doBorder = (level, lowColor, highColor) => {
    borderTStates += TSTATES_PER_SAMPLE;
    if (borderTStates >= BORDER_LINE_TSTATES) {
        borderTStates -= BORDER_LINE_TSTATES;
        if (borderIndex < 256) {
            if (level > 0) {
                border[borderIndex] = highColor;
            } else {
                border[borderIndex] = lowColor;
            }
        }
        borderIndex++;
        if (borderIndex >= BORDER_LINES_PER_FRAME) {
            postBorder = true;
            borderIndex = 0;
        }
    }
};

class SaveToTapeProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);

        this.blockPos = 0;
        this.blockPhase = null;
        this.done = false;
        this.level = 0.1;
        this.prevLevel = 0.0;
        this.borderColor = 7;
        for (let i = 0; i < 256; ++i) border[i] = this.borderColor;

        this.port.onmessage = this.onmessage.bind(this);
    }

    onmessage(e) {
        this.tap = e.data;
    }

    pauseLevel() {
        this.blockPhase.pause -= TSTATES_PER_SAMPLE;
        if (this.blockPhase.pause < 0) {
            this.blockPhase.pause = 0;
        }
    }

    leadLevel() {
        this.blockPhase.tstate += TSTATES_PER_SAMPLE;
        if (this.blockPhase.tstate >= LEAD_TSTATES) {
            this.level = -this.level;
            this.blockPhase.tstate -= LEAD_TSTATES;
            this.blockPhase.lead--;
        }
    }

    sync1Level() {
        this.blockPhase.tstate += TSTATES_PER_SAMPLE;
        if (this.blockPhase.tstate >= SYNC1_TSTATES) {
            this.level = -this.level;
            this.blockPhase.tstate -= SYNC1_TSTATES;
            this.blockPhase.sync1 = 0;
        }
    }

    sync2Level() {
        this.blockPhase.tstate += TSTATES_PER_SAMPLE;
        if (this.blockPhase.tstate >= SYNC2_TSTATES) {
            this.level = -this.level;
            this.blockPhase.tstate -= SYNC2_TSTATES;
            this.blockPhase.sync2 = 0;
        }
    }

    dataLevel() {
        this.blockPhase.tstate += TSTATES_PER_SAMPLE;
        const bit = this.tap[this.blockPhase.start + this.blockPhase.offset] & (1 << this.blockPhase.bit);
        const phase_length = bit ? SET_BIT_TSTATES : RESET_BIT_TSTATES;
        if (this.blockPhase.tstate >= phase_length) {
            this.level = -this.level;
            this.blockPhase.tstate -= phase_length;
            this.blockPhase.pulse--;
            if (this.blockPhase.pulse === 0) {
                this.blockPhase.bit--;
                this.blockPhase.pulse = 2;
                if (this.blockPhase.bit < 0) {
                    this.blockPhase.offset++;
                    this.blockPhase.bit = 7;
                    if (this.blockPhase.offset >= this.blockPhase.length) {
                        this.blockPos = this.blockPhase.start + this.blockPhase.length;
                        this.blockPhase = null;
                    }
                }
            }
        }
    }


    nextLevel() {
        if (this.done) {
            doBorder(this.level, 7, 7);
            return this.level;
        }

        if (!this.tap) {
            doBorder(this.level, 7, 7);
            return 0.0;
        }

        if (!this.blockPhase) {
            if (this.blockPos >= this.tap.length) {
                this.done = true;
                this.port.postMessage('done');
                this.borderColor = 7;
                for (let i = 0; i < 256; ++i) border[i] = this.borderColor;
                this.port.postMessage(border);
                return this.level;
            }
            else {
                const blockLength = this.tap[this.blockPos] + this.tap[this.blockPos + 1] * 256;
                const blockType = this.tap[this.blockPos + 2];
                const leadTstates = blockType ? DATA_LEAD_PULSES : HEADER_LEAD_PULSES;
                this.blockPhase = { tstate: 0, pause: this.blockPos === 0 ? 0 : PAUSE_TSTATES, lead: leadTstates, sync1: 1, sync2: 1, start: this.blockPos + 2, length: blockLength, offset: 0, bit: 7, pulse: 2 };
            }
        }

        if (this.blockPhase.pause) {
            this.pauseLevel();
            doBorder(this.level, 7, 7);
        }
        else if (this.blockPhase.lead) {
            this.leadLevel();
            doBorder(this.level, 2, 5);
        }
        else if (this.blockPhase.sync1) {
            this.sync1Level();
            doBorder(this.level, 2, 5);
        }
        else if (this.blockPhase.sync2) {
            this.sync2Level();
            doBorder(this.level, 2, 5);
        }
        else {
            this.dataLevel();
            doBorder(this.level, 1, 6);
        }

        return this.level;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        output.forEach(channel => {
            for (let i = 0; i < channel.length; ++i) {
                const level = this.nextLevel();
                // Some softening
                this.prevLevel = (this.prevLevel * 0.25 + level * 0.75);
                channel[i] = this.prevLevel;
            }
        });
        if (postBorder) {
            postBorder = false;
            this.port.postMessage(border);
        }

        return true;
    }
}

registerProcessor('save-to-tape', SaveToTapeProcessor);
