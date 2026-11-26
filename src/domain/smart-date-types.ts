export type SmartDateDisplayFormat = 'relative' | 'full' | 'short' | 'iso';

export type SmartDateResult =
    | { kind: 'date'; date: string; source: string; isReminder?: boolean }
    | {
          kind: 'datetime';
          date: string;
          time: string;
          isoUtc: string;
          source: string;
          isReminder?: boolean;
      };

export class SmartDateError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SmartDateError';
    }
}
