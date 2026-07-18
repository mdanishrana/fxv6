// node-postgres's default `date` type parser builds JS Date objects at LOCAL
// midnight (not UTC midnight). Serializing that straight to JSON calls
// .toISOString() (or express's res.json() does it implicitly), which converts
// to UTC first - silently shifting the date backward a day in any
// positive-UTC-offset timezone (this server is GMT+3). Always read a pg `date`
// column through this helper before sending it to a client, rather than
// passing the raw Date object straight into a JSON response body.
function pgDateToStr(val) {
    if (val == null) return null;
    if (val instanceof Date) {
        const pad2 = (n) => String(n).padStart(2, '0');
        return `${val.getFullYear()}-${pad2(val.getMonth() + 1)}-${pad2(val.getDate())}`;
    }
    return String(val).split('T')[0];
}

module.exports = { pgDateToStr };
