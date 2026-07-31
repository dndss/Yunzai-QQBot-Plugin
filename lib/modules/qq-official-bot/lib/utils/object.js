"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toObject = void 0;
exports.deepClone = deepClone;
const toObject = (data) => {
    if (Buffer.isBuffer(data))
        return JSON.parse(data.toString());
    if (typeof data === 'object')
        return data;
    if (typeof data === 'string')
        return JSON.parse(data);
};
exports.toObject = toObject;
function deepClone(obj) {
    if (typeof obj !== "object")
        return obj;
    if (Array.isArray(obj))
        return obj.map(deepClone);
    const Constructor = obj.constructor;
    let newObj = Constructor();
    for (let key in obj) {
        newObj[key] = deepClone(obj[key]);
    }
    return newObj;
}
