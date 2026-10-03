'use strict';
const { isIP } = require('node:net');
const ip = process.argv[2] || '';
const [a, b] = ip.split('.').map(Number);
// Accept only RFC1918 IPv4 destinations; Docker can allocate any of these pools.
const privateAddress = isIP(ip) === 4 && (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168));
process.exit(privateAddress ? 0 : 1);
