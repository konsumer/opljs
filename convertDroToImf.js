// convert DRO file to IMF file
export default function convertDroToImf(droData, options = {}) {
    const {
        rate = 560,        // Default IMF rate in Hz (560 for Keen)
        type = 0,          // IMF type: 0 for Type-0 (Keen), 1 for Type-1 (Wolf3D)
        title = "",        // For Type-1 files
        composer = "",     // For Type-1 files
        remarks = ""       // For Type-1 files
    } = options;

    // Helper functions for little-endian reading/writing
    function readUint16LE(view, offset) {
        return view.getUint16(offset, true);
    }

    function readUint32LE(view, offset) {
        return view.getUint32(offset, true);
    }

    function writeUint16LE(array, offset, value) {
        array[offset] = value & 0xFF;
        array[offset + 1] = (value >> 8) & 0xFF;
        return offset + 2;
    }

    function writeUint32LE(array, offset, value) {
        array[offset] = value & 0xFF;
        array[offset + 1] = (value >> 8) & 0xFF;
        array[offset + 2] = (value >> 16) & 0xFF;
        array[offset + 3] = (value >> 24) & 0xFF;
        return offset + 4;
    }

    // Create DataView for easier byte manipulation
    const droView = new DataView(droData.buffer, droData.byteOffset, droData.byteLength);
    let droOffset = 0;

    // Parse DRO header
    const signature = new TextDecoder().decode(droData.slice(0, 8));
    if (signature !== "DBRAWOPL") {
        throw new Error("Input file is not in DOSBox .dro format!");
    }
    droOffset += 8;

    const version = readUint32LE(droView, droOffset);
    droOffset += 4;

    if (version !== 0x10000 && version !== 0x2) {
        throw new Error(`Only version 0.1 (1.0) and 2.0 files are supported - this is version ${version & 0xFFFF}.${version >> 16}`);
    }

    // Prepare output buffer (we'll resize it later)
    let imfData = new Uint8Array(droData.length * 2); // Start with generous size
    let imfOffset = 0;
    let dLastDelay = 0.0; // For more accurate delays (v1.2 feature)

    if (version === 0x2) {
        // Version 2.0 DRO file
        const lengthPairs = readUint32LE(droView, droOffset);
        droOffset += 4;
        
        const lengthMs = readUint32LE(droView, droOffset);
        droOffset += 4;

        // Hardware Type (ignored)
        const hardwareType = droView.getUint8(droOffset);
        droOffset += 1;

        // Format - Data arrangement
        const format = droView.getUint8(droOffset);
        droOffset += 1;
        if (format !== 0) {
            throw new Error("Unknown data arrangement detected; File format unsupported.");
        }

        // Compression
        const compression = droView.getUint8(droOffset);
        droOffset += 1;
        if (compression !== 0) {
            throw new Error("Compression has been detected. Thus, file is unsupported.");
        }

        const shortDelayCode = droView.getUint8(droOffset);
        droOffset += 1;

        const longDelayCode = droView.getUint8(droOffset);
        droOffset += 1;

        const codemapLength = droView.getUint8(droOffset);
        droOffset += 1;

        if (codemapLength > 128) {
            throw new Error("Too long codemap size detected; File format unrecognized.");
        }

        const codemap = new Uint8Array(droData.slice(droOffset, droOffset + codemapLength));
        droOffset += codemapLength;

        console.log(`Data is ${lengthPairs << 1} bytes long.`);

        // Write IMF header
        if (type === 1) {
            // Type-1: Make space for file length (we'll write it later)
            imfOffset = writeUint16LE(imfData, imfOffset, 0);
        } else {
            // Type-0: Write 4 padding zeros
            imfOffset = writeUint32LE(imfData, imfOffset, 0);
        }

        // Start with NULL Adlib data
        imfOffset = writeUint16LE(imfData, imfOffset, 0);

        let lastDelay = 0;
        let warnOfDualOPL = true;

        for (let len = 0; len < lengthPairs; len++) {
            const regIndex = droView.getUint8(droOffset);
            droOffset += 1;

            if (regIndex === shortDelayCode) {
                // Short delay code
                const delayByte = droView.getUint8(droOffset);
                droOffset += 1;
                lastDelay += 1 + delayByte;
            } else if (regIndex === longDelayCode) {
                // Long delay code
                const delayByte = droView.getUint8(droOffset);
                droOffset += 1;
                lastDelay += (1 + delayByte) << 8;
            } else {
                // Adlib data
                if (regIndex & 0x80) {
                    const oplReg = codemap[regIndex & 0x7F];
                    const data = droView.getUint8(droOffset);
                    droOffset += 1;

                    if (warnOfDualOPL) {
                        if (oplReg >= 0xB0 && oplReg <= 0xB8 && (data & 0x20)) {
                            console.warn("Warning: This song uses multiple OPL chips, which the IMF format doesn't support!");
                            warnOfDualOPL = false;
                        }
                    }
                    continue;
                }

                // Calculate delay with double precision
                dLastDelay += (lastDelay * rate) / 1000.0;
                const delayToWrite = Math.floor(dLastDelay);
                dLastDelay -= delayToWrite;

                // Ensure we have enough space
                if (imfOffset + 4 >= imfData.length) {
                    const newData = new Uint8Array(imfData.length * 2);
                    newData.set(imfData);
                    imfData = newData;
                }

                imfOffset = writeUint16LE(imfData, imfOffset, delayToWrite);

                const data = droView.getUint8(droOffset);
                droOffset += 1;

                imfData[imfOffset++] = codemap[regIndex];
                imfData[imfOffset++] = data;

                lastDelay = 0;
            }
        }
    } else {
        // Version 0.1 (1.0) DRO file
        const lengthMs = readUint32LE(droView, droOffset);
        droOffset += 4;

        const lengthBytes = readUint32LE(droView, droOffset);
        droOffset += 4;

        // Hardware type handling (complex logic from original)
        let hardwareType = droView.getUint8(droOffset);
        droOffset += 1;

        // Check if it's a 4-byte value
        const pos = droOffset;
        let is4Byte = true;
        for (let i = 0; i < 3; i++) {
            if (droOffset >= droData.length || droView.getUint8(droOffset) !== 0) {
                is4Byte = false;
                break;
            }
            droOffset += 1;
        }

        if (!is4Byte) {
            droOffset = pos; // Reset to 1-byte position
        }

        console.log(`Data is ${lengthBytes} bytes long.`);

        // Write IMF header
        if (type === 1) {
            imfOffset = writeUint16LE(imfData, imfOffset, 0);
        } else {
            imfOffset = writeUint32LE(imfData, imfOffset, 0);
        }

        imfOffset = writeUint16LE(imfData, imfOffset, 0);

        let lastDelay = 0;
        let warnOfDualOPL = true;

        for (let len = 0; len < lengthBytes; len++) {
            let reg = droView.getUint8(droOffset);
            droOffset += 1;

            switch (reg) {
                case 0x00: {
                    // Delay, BYTE param
                    const delayByte = droView.getUint8(droOffset);
                    droOffset += 1;
                    lastDelay += 1 + delayByte;
                    len++;
                    break;
                }
                case 0x01: {
                    // Delay, UINT16LE param
                    const delay = readUint16LE(droView, droOffset);
                    droOffset += 2;
                    lastDelay += 1 + delay;
                    len += 2;
                    break;
                }
                case 0x02:
                case 0x03: {
                    // Switch to chip #0 or #1
                    if (warnOfDualOPL) {
                        console.warn("Warning: This song uses multiple OPL chips, which the IMF format doesn't support!");
                        warnOfDualOPL = false;
                    }
                    break;
                }
                case 0x04: {
                    // Escape, treat next two bytes as data
                    reg = droView.getUint8(droOffset);
                    droOffset += 1;
                    len++;
                    // Fall through to default case
                }
                default: {
                    // Adlib data
                    dLastDelay += (lastDelay * rate) / 1000.0;
                    const delayToWrite = Math.floor(dLastDelay);
                    dLastDelay -= delayToWrite;

                    // Ensure we have enough space
                    if (imfOffset + 4 >= imfData.length) {
                        const newData = new Uint8Array(imfData.length * 2);
                        newData.set(imfData);
                        imfData = newData;
                    }

                    imfOffset = writeUint16LE(imfData, imfOffset, delayToWrite);

                    const data = droView.getUint8(droOffset);
                    droOffset += 1;
                    len++;

                    imfData[imfOffset++] = reg;
                    imfData[imfOffset++] = data;

                    lastDelay = 0;
                    break;
                }
            }
        }
    }

    // Finish with zero delay
    if (imfOffset + 2 >= imfData.length) {
        const newData = new Uint8Array(imfData.length + 2);
        newData.set(imfData);
        imfData = newData;
    }
    imfOffset = writeUint16LE(imfData, imfOffset, 0);

    // For Type-1, write the data size at the beginning
    if (type === 1) {
        const dataSize = imfOffset - 2;
        writeUint16LE(imfData, 0, dataSize);
    }

    // Add tags if specified and Type-1
    if (type === 1 && (title || composer || remarks)) {
        imfOffset = addIMFTags(imfData, imfOffset, title, composer, remarks);
    }

    // Return properly sized array
    return imfData.slice(0, imfOffset);
}

function addIMFTags(imfData, offset, title, composer, remarks) {
    if (title.length >= 255) {
        console.error("ERROR: Title field must be less than 255 characters, ignoring IMF tags.");
        return offset;
    }
    if (composer.length >= 255) {
        console.error("ERROR: Composer field must be less than 255 characters, ignoring IMF tags.");
        return offset;
    }
    if (remarks.length >= 255) {
        console.error("ERROR: Remarks field must be less than 255 characters, ignoring IMF tags.");
        return offset;
    }

    // Ensure we have enough space
    const neededSpace = 1 + title.length + 1 + composer.length + 1 + remarks.length + 1 + 9;
    if (offset + neededSpace >= imfData.length) {
        const newData = new Uint8Array(offset + neededSpace);
        newData.set(imfData.slice(0, offset));
        imfData = newData;
    }

    // Signature byte
    imfData[offset++] = 0x1A;

    // Title
    const titleBytes = new TextEncoder().encode(title + '\0');
    imfData.set(titleBytes, offset);
    offset += titleBytes.length;

    // Composer
    const composerBytes = new TextEncoder().encode(composer + '\0');
    imfData.set(composerBytes, offset);
    offset += composerBytes.length;

    // Remarks
    const remarksBytes = new TextEncoder().encode(remarks + '\0');
    imfData.set(remarksBytes, offset);
    offset += remarksBytes.length;

    // Program name
    const programBytes = new TextEncoder().encode("DRO2IMF\0\0");
    imfData.set(programBytes, offset);
    offset += programBytes.length;

    return offset;
}

