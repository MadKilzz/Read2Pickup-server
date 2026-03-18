const PLATFORM_EPOCH = 1609459200000; // 2021-01-01T00:00:00.000Z
let increment = 0;

class Snowflake {
    static generate(workerId = 1, processId = 1): string {
        const now = Date.now();

        // timestamp gedeelte
        const timestamp = BigInt(now - PLATFORM_EPOCH) << 22n;

        // worker en process ID
        const worker = (BigInt(workerId) & 0b11111n) << 17n;
        const process = (BigInt(processId) & 0b11111n) << 12n;

        // increment (12 bits)
        if (increment >= 4095) increment = 0;
        const inc = BigInt(increment++ & 0b111111111111);

        // alles samenvoegen
        return (timestamp | worker | process | inc).toString();
    }

    static deconstruct(id: string) {
        const snowflake = BigInt(id);

        const timestamp = Number((snowflake >> 22n)) + PLATFORM_EPOCH;
        const workerId = Number((snowflake >> 17n) & 0b11111n);
        const processId = Number((snowflake >> 12n) & 0b11111n);
        const increment = Number(snowflake & 0b111111111111n);

        return {
            id,
            timestamp,
            date: new Date(timestamp),
            workerId,
            processId,
            increment,
        };
    }
}

export default Snowflake;
