const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const MAGENTA = '\x1b[35m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';

class Logger {
    private prefix: string;

    constructor(prefix?: string) {
        this.prefix = prefix ?? 'Log';
    }

    private getTimestamp(): string {
        const D = new Date();
        const day = D.getDate();
        const month = D.getMonth() + 1;
        const year = D.getFullYear();
        const hours = D.getHours().toString().padStart(2, '0');
        const minutes = D.getMinutes().toString().padStart(2, '0');
        const seconds = D.getSeconds().toString().padStart(2, '0');

        return `${GRAY}[${day}-${month}-${year} ${hours}:${minutes}:${seconds}]${RESET}`;
    }

    private formatMessage(message: unknown, context?: object): string {
        let msg = "";

        if (message instanceof Error) {
            msg = message.stack || message.message;
        } else if (typeof message === 'object') {
            try {
                msg = JSON.stringify(message, null, 2);
            } catch {
                msg = String(message);
            }
        } else {
            msg = String(message);
        }

        if (context) {
            try {
                msg += ` ${JSON.stringify(context, null, 2)}`;
            } catch {}
        }

        return msg;
    }

    public info(message: unknown, context?: object): void {
        const time = this.getTimestamp();
        console.info(`${MAGENTA}${this.prefix} | Info${RESET} - ${time} ${this.formatMessage(message, context)}`);
    }

    public ready(message: unknown, context?: object): void {
        const time = this.getTimestamp();
        console.info(`${GREEN}${this.prefix} | Ready${RESET} - ${time} ${this.formatMessage(message, context)}`);
    }

    public error(message: unknown, context?: object): void {
        const time = this.getTimestamp();
        console.error(`${RED}${this.prefix} | Error${RESET} - ${time} ${this.formatMessage(message, context)}`);
    }

    public warn(message: unknown, context?: object): void {
        const time = this.getTimestamp();
        console.warn(`${MAGENTA}${this.prefix} | Warn${RESET} - ${time} ${this.formatMessage(message, context)}`);
    }
}

export default Logger;
