"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trimQuote = trimQuote;
function trimQuote(str) {
    const quotes = [
        ['"', '"'],
        ["'", "'"],
        ['`', '`'],
        ['“', '”'],
        ['‘', '’']
    ];
    for (let i = 0; i < quotes.length; i++) {
        const [start, end] = quotes[i];
        if (str.startsWith(start) && str.endsWith(end)) {
            return str.slice(1, -1);
        }
    }
    return str;
}
