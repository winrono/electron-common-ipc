import { Buffer } from 'buffer';
import { BufferReader } from './bufferReader';
import { BufferWriter } from './bufferWriter';
import * as wrap from './ipcPacketBufferWrap';

export class IpcPacketBuffer { // extends wrap.IpcPacketBufferWrap {
    // Thanks to https://github.com/tests-always-included/buffer-serializer/
    static fromNumber(dataNumber: number): Buffer {
        // An integer
        if (Math.floor(dataNumber) === dataNumber) {
            let absDataNumber = Math.abs(dataNumber);
            // 32-bit integer
            if (absDataNumber <= 0xFFFFFFFF) {
                let header: wrap.IpcPacketBufferWrap;
                // Negative integer
                if (dataNumber < 0) {
                    wrap.IpcPacketBufferWrap.fromType(wrap.BufferType.NegativeInteger);
                }
                // Positive integer
                else {
                    wrap.IpcPacketBufferWrap.fromType(wrap.BufferType.PositiveInteger);
                }
                let bufferWriter = new BufferWriter(new Buffer(header.packetSize));
                header.writeHeader(bufferWriter);
                bufferWriter.writeUInt32(absDataNumber);
                header.writeFooter(bufferWriter);
                return bufferWriter.buffer;
            }
        }
        // Either this is not an integer or it is outside of a 32-bit integer.
        // Store as a double.
        let header = wrap.IpcPacketBufferWrap.fromType(wrap.BufferType.Double);

        let bufferWriter = new BufferWriter(new Buffer(header.packetSize));
        header.writeHeader(bufferWriter);
        bufferWriter.writeDouble(dataNumber);
        header.writeFooter(bufferWriter);
        return bufferWriter.buffer;
    }

    static fromBoolean(dataBoolean: boolean): Buffer {
        let header = wrap.IpcPacketBufferWrap.fromType(wrap.BufferType.Boolean);

        let bufferWriter = new BufferWriter(new Buffer(header.packetSize));
        header.writeHeader(bufferWriter);
        bufferWriter.writeByte(dataBoolean ? 0xFF : 0x00);
        header.writeFooter(bufferWriter);
        return bufferWriter.buffer;
    }

    static fromString(data: string, encoding?: string): Buffer {
        let header = wrap.IpcPacketBufferWrap.fromType(wrap.BufferType.String);
        header.contentSize = data.length;

        let bufferWriter = new BufferWriter(new Buffer(header.packetSize));
        header.writeHeader(bufferWriter);
        bufferWriter.writeString(data, encoding);
        header.writeFooter(bufferWriter);
        return bufferWriter.buffer;
    }

    static fromObject(dataObject: Object): Buffer {
        let data = JSON.stringify(dataObject);
        let header = wrap.IpcPacketBufferWrap.fromType(wrap.BufferType.Object);
        header.contentSize = data.length;

        let bufferWriter = new BufferWriter(new Buffer(header.packetSize));
        header.writeHeader(bufferWriter);
        bufferWriter.writeString(data, 'utf8');
        header.writeFooter(bufferWriter);
        return bufferWriter.buffer;
    }

    static fromBuffer(data: Buffer): Buffer {
        let header = wrap.IpcPacketBufferWrap.fromType(wrap.BufferType.Buffer);
        header.contentSize = data.length;

        let bufferWriter = new BufferWriter(new Buffer(header.packetSize));
        header.writeHeader(bufferWriter);
        bufferWriter.writeBuffer(data);
        header.writeFooter(bufferWriter);
        return bufferWriter.buffer;
    }

    static fromArray(args: any[]): Buffer {
        let buffers: Buffer[] = [];
        let buffersLength = 0;
        args.forEach((arg) => {
            let buffer = IpcPacketBuffer.from(arg);
            buffersLength += buffer.length;
            buffers.push(buffer);
        });

        let header = wrap.IpcPacketBufferWrap.fromType(wrap.BufferType.Array);
        header.contentSize = buffersLength;

        let bufferWriterHeader = new BufferWriter(new Buffer(header.headerSize));
        header.writeHeader(bufferWriterHeader);

        let bufferWriterFooter = new BufferWriter(new Buffer(header.footerSize));
        header.writeFooter(bufferWriterFooter);

        buffers.unshift(bufferWriterHeader.buffer);
        buffers.push(bufferWriterFooter.buffer);

        return Buffer.concat(buffers, header.packetSize);
    }

    static from(data: any): Buffer {
        let buffer: Buffer;
        if (Buffer.isBuffer(data)) {
            buffer = IpcPacketBuffer.fromBuffer(data);
        }
        else if (Array.isArray(data)) {
            buffer = IpcPacketBuffer.fromArray(data);
        }
        else {
            switch (typeof data) {
                case 'object':
                    buffer = IpcPacketBuffer.fromObject(data);
                    break;
                case 'string':
                    buffer = IpcPacketBuffer.fromString(data);
                    break;
                case 'number':
                    buffer = IpcPacketBuffer.fromNumber(data);
                    break;
                case 'boolean':
                    buffer = IpcPacketBuffer.fromBoolean(data);
                    break;
            }
        }
        return buffer;
    }

    static to(buffer: Buffer, offset?: number): any {
        let bufferReader = new BufferReader(buffer, offset);
        let header = wrap.IpcPacketBufferWrap.fromBufferHeader(bufferReader);
        return IpcPacketBuffer._to(header, bufferReader);
    }

    private static _to(header: wrap.IpcPacketBufferWrap, bufferReader: BufferReader): any {
        let arg: any;
        switch (header.type) {
            case wrap.BufferType.Array: {
                arg = IpcPacketBuffer._toArray(header, bufferReader);
                break;
            }
            case wrap.BufferType.Object: {
                arg = IpcPacketBuffer._toObject(header, bufferReader);
                break;
            }
            case wrap.BufferType.String: {
                arg = IpcPacketBuffer._toString(header, bufferReader);
                break;
            }
            case wrap.BufferType.Buffer: {
                arg = IpcPacketBuffer._toBuffer(header, bufferReader);
                break;
            }
            case wrap.BufferType.PositiveInteger:
            case wrap.BufferType.NegativeInteger:
            case wrap.BufferType.Double: {
                arg = IpcPacketBuffer._toNumber(header, bufferReader);
                break;
            }
            case wrap.BufferType.Boolean: {
                arg = IpcPacketBuffer._toBoolean(header, bufferReader);
                break;
            }
        }
        return arg;
    }

    static toBoolean(buffer: Buffer, offset?: number): boolean {
        let bufferReader = new BufferReader(buffer, offset);
        let header = wrap.IpcPacketBufferWrap.fromBufferHeader(bufferReader);
        if (header.isBoolean() === false) {
            return null;
        }
        return IpcPacketBuffer._toBoolean(header, bufferReader);
    }

    private static _toBoolean(header: wrap.IpcPacketBufferWrap, bufferReader: BufferReader): boolean {
        let data: boolean = (bufferReader.readByte() === 0xFF);
        bufferReader.skip(header.footerSize);
        return data;
    }

    static toNumber(buffer: Buffer, offset?: number): number {
        let bufferReader = new BufferReader(buffer, offset);
        let header = wrap.IpcPacketBufferWrap.fromBufferHeader(bufferReader);
        if (header.isNumber() === false) {
            return null;
        }
        return IpcPacketBuffer._toNumber(header, bufferReader);
    }

    private static _toNumber(header: wrap.IpcPacketBufferWrap, bufferReader: BufferReader): number {
        let data: number;
        switch (header.type) {
            case wrap.BufferType.Double:
                data = bufferReader.readDouble();
                break;
            case wrap.BufferType.NegativeInteger:
                data = -bufferReader.readUInt32();
                break;
            case wrap.BufferType.PositiveInteger:
                data = +bufferReader.readUInt32();
                break;
            default:
                data = null;
                break;
        }
        bufferReader.skip(header.footerSize);
        return data;
    }

    static toObject(buffer: Buffer, offset?: number): any {
        let bufferReader = new BufferReader(buffer, offset);
        let header = wrap.IpcPacketBufferWrap.fromBufferHeader(bufferReader);
        if (header.isObject() === false) {
            return null;
        }
        return IpcPacketBuffer._toObject(header, bufferReader);
    }

    private static _toObject(header: wrap.IpcPacketBufferWrap, bufferReader: BufferReader): any {
        let data = bufferReader.readString('utf8', header.contentSize);
        bufferReader.skip(header.footerSize);
        return JSON.parse(data);
    }

    static toString(buffer: Buffer, offset?: number, encoding?: string): string {
        let bufferReader = new BufferReader(buffer, offset);
        let header = wrap.IpcPacketBufferWrap.fromBufferHeader(bufferReader);
        if (header.isString() === false) {
            return null;
        }
        return IpcPacketBuffer._toString(header, bufferReader, encoding);
    }

    private static _toString(header: wrap.IpcPacketBufferWrap, bufferReader: BufferReader, encoding?: string): string {
        let data = bufferReader.readString(encoding, header.contentSize);
        bufferReader.skip(header.footerSize);
        return data;
    }

    static toBuffer(buffer: Buffer, offset?: number): Buffer {
        let bufferReader = new BufferReader(buffer, offset);
        let header = wrap.IpcPacketBufferWrap.fromBufferHeader(bufferReader);
        if (header.isBuffer() === false) {
            return null;
        }
        return IpcPacketBuffer._toBuffer(header, bufferReader);
    }

    private static _toBuffer(header: wrap.IpcPacketBufferWrap, bufferReader: BufferReader): Buffer {
        let data = bufferReader.readBuffer(header.contentSize);
        bufferReader.skip(header.footerSize);
        return data;
    }

    static toArrayAt(index: number, buffer: Buffer, offset?: number): any {
        let bufferReader = new BufferReader(buffer, offset);
        let header = wrap.IpcPacketBufferWrap.fromBufferHeader(bufferReader);
        if (header.isArray() === false) {
            return null;
        }
        return IpcPacketBuffer._toArrayAt(index, header, bufferReader);
    }

    private static _toArrayAt(index: number, header: wrap.IpcPacketBufferWrap, bufferReader: BufferReader): any {
        let offsetContentSize = bufferReader.offset + header.contentSize;
        let headerArg = wrap.IpcPacketBufferWrap.fromType(wrap.BufferType.HeaderNotValid);
        while ((index > 0) && (bufferReader.offset < offsetContentSize)) {
            headerArg.readHeader(bufferReader);
            bufferReader.skip(headerArg.contentSize + header.footerSize);
            --index;
        }
        let arg: any;
        if (index === 0) {
            headerArg.readHeader(bufferReader);
            arg = IpcPacketBuffer._to(headerArg, bufferReader);
        }
        return arg;
    }

    static toArray(buffer: Buffer, offset?: number): any[] {
        let bufferReader = new BufferReader(buffer, offset);
        let header = wrap.IpcPacketBufferWrap.fromBufferHeader(bufferReader);
        if (header.isArray() === false) {
            return null;
        }
        return IpcPacketBuffer._toArray(header, bufferReader);
    }

    private static _toArray(header: wrap.IpcPacketBufferWrap, bufferReader: BufferReader): any[] {
        let offsetContentSize = bufferReader.offset + header.contentSize;
        let args = [];
        let headerArg = wrap.IpcPacketBufferWrap.fromType(wrap.BufferType.HeaderNotValid);
        while (bufferReader.offset < offsetContentSize) {
            headerArg.readHeader(bufferReader);
            let arg = IpcPacketBuffer._to(headerArg, bufferReader);
            args.push(arg);
        }
        bufferReader.skip(header.footerSize);
        return args;
    }
}