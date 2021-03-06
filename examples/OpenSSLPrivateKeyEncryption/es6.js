/* eslint-disable no-undef,no-unreachable,no-unused-vars */
import * as asn1js from "asn1js";
import { utilConcatBuf, stringToArrayBuffer, fromBase64, toBase64, arrayBufferToString } from "pvutils";
import { setEngine } from "../../src/common.js";
import PrivateKeyInfo from "../../src/PrivateKeyInfo.js";
import RSAPrivateKey from "../../src/RSAPrivateKey.js";
//<nodewebcryptoossl>
//*********************************************************************************
let opensslEncryptedBuffer = new ArrayBuffer(0); // ArrayBuffer with loaded or created TSP request
//*********************************************************************************
function formatPEM(pemString)
{
	/// <summary>Format string in order to have each line with length equal to 63</summary>
	/// <param name="pemString" type="String">String to format</param>

	const stringLength = pemString.length;
	let resultString = "";

	for(let i = 0, count = 0; i < stringLength; i++, count++)
	{
		if(count > 63)
		{
			resultString = `${resultString}\r\n`;
			count = 0;
		}

		resultString = `${resultString}${pemString[i]}`;
	}

	return resultString;
}
//*********************************************************************************
function md5(data, offset, length)
{
	//region Initial variables
	const r = new Uint8Array([
		7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
		5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
		4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
		6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]);

	const k = new Int32Array([
		-680876936, -389564586, 606105819, -1044525330, -176418897, 1200080426,
		-1473231341, -45705983, 1770035416, -1958414417, -42063, -1990404162,
		1804603682, -40341101, -1502002290, 1236535329, -165796510, -1069501632,
		643717713, -373897302, -701558691, 38016083, -660478335, -405537848,
		568446438, -1019803690, -187363961, 1163531501, -1444681467, -51403784,
		1735328473, -1926607734, -378558, -2022574463, 1839030562, -35309556,
		-1530992060, 1272893353, -155497632, -1094730640, 681279174, -358537222,
		-722521979, 76029189, -640364487, -421815835, 530742520, -995338651,
		-198630844, 1126891415, -1416354905, -57434055, 1700485571, -1894986606,
		-1051523, -2054922799, 1873313359, -30611744, -1560198380, 1309151649,
		-145523070, -1120210379, 718787259, -343485551]);

	let h0 = 1732584193;
	let h1 = -271733879;
	let h2 = -1732584194;
	let h3 = 271733878;

	const w = new Int32Array(16);

	let i;
	let j;
	//endregion

	// pre-processing
	if(data instanceof ArrayBuffer)
	{
		length = data.byteLength;
		data = new Uint8Array(data);
	}

	const paddedLength = (length + 72) & ~63; // data + 9 extra bytes
	const padded = new Uint8Array(paddedLength);

	for(i = 0; i < length; ++i)
		padded[i] = data[offset++];

	padded[i++] = 0x80;
	const n = paddedLength - 8;

	while(i < n)
		padded[i++] = 0;

	padded[i++] = (length << 3) & 0xFF;
	padded[i++] = (length >> 5) & 0xFF;
	padded[i++] = (length >> 13) & 0xFF;
	padded[i++] = (length >> 21) & 0xFF;
	padded[i++] = (length >>> 29) & 0xFF;
	padded[i++] = 0;
	padded[i++] = 0;
	padded[i++] = 0;

	for(i = 0; i < paddedLength;)
	{
		let a = h0;
		let b = h1;
		let c = h2;
		let d = h3;
		let f;
		let g;

		for(j = 0; j < 16; ++j, i += 4)
			w[j] = (padded[i] | (padded[i + 1] << 8) | (padded[i + 2] << 16) | (padded[i + 3] << 24));

		for(j = 0; j < 64; ++j)
		{
			switch(true)
			{
				case (j < 16):
					f = (b & c) | ((~b) & d);
					g = j;
					break;
				case (j < 32):
					f = (d & b) | ((~d) & c);
					g = (5 * j + 1) & 15;
					break;
				case (j < 48):
					f = b ^ c ^ d;
					g = (3 * j + 5) & 15;
					break;
				default:
					f = c ^ (b | (~d));
					g = (7 * j) & 15;
			}

			const tmp = d;
			const rotateArg = (a + f + k[j] + w[g]) | 0;
			const rotate = r[j];

			d = c;
			c = b;
			b = (b + ((rotateArg << rotate) | (rotateArg >>> (32 - rotate)))) | 0;
			a = tmp;
		}

		h0 = (h0 + a) | 0;
		h1 = (h1 + b) | 0;
		h2 = (h2 + c) | 0;
		h3 = (h3 + d) | 0;
	}

	return (new Uint8Array([
		h0 & 0xFF, (h0 >> 8) & 0xFF, (h0 >> 16) & 0xFF, (h0 >>> 24) & 0xFF,
		h1 & 0xFF, (h1 >> 8) & 0xFF, (h1 >> 16) & 0xFF, (h1 >>> 24) & 0xFF,
		h2 & 0xFF, (h2 >> 8) & 0xFF, (h2 >> 16) & 0xFF, (h2 >>> 24) & 0xFF,
		h3 & 0xFF, (h3 >> 8) & 0xFF, (h3 >> 16) & 0xFF, (h3 >>> 24) & 0xFF
	])).buffer;
}
//*********************************************************************************
function openSSLBytesToKey(password, salt, keyLength, count)
{
	//region Initial variables
	const hashes = [];
	//endregion

	hashes.push(md5(utilConcatBuf(password, salt), 0));

	for(let i = 1; i <= count; i++)
		hashes.push(md5(utilConcatBuf(hashes[i - 1], password, salt), 0));

	return utilConcatBuf(...hashes).slice(0, keyLength);
}
//*********************************************************************************
function hex2b(hex)
{
	const resultBuffer = new ArrayBuffer(hex.length >> 1);
	const resultView = new Uint8Array(resultBuffer);

	let i = 0;
	let j = 0;

	for(; (i < hex.length && hex.substr(i, 2) !== "00"); i += 2, j++)
		resultView[j] = parseInt(hex.substr(i, 2), 16);

	return resultBuffer;
}
//*********************************************************************************
//region Create OpenSSL Encrypted Private Key
//*********************************************************************************
function createOpenSSLPrivateKeyInternal()
{
	return Promise.resolve();
}
//*********************************************************************************
function createOpenSSLPrivateKey()
{
	return Promise.resolve();
}
//*********************************************************************************
//endregion 
//*********************************************************************************
//region Parse existing OpenSSL Encrypted Private Key
//*********************************************************************************
/**
 * Decrypt encrypted OpenSSL Encrypted Private Key
 * @param {ArrayBuffer} encryptedKey The encrypted key data
 * @param {ArrayBuffer} password Password for the encrypted data
 * @param {string} algorithmName String representation of algorithm's name
 * @param {number} keyLength Key length for decryption key (for AES-256-CBC it should be 32)
 * @param {ArrayBuffer} iv Initialization Vector
 * @return {Promise<ArrayBuffer>} Decrypted Private key
 */
async function decryptOpenSSLPrivateKey(encryptedKey, password, algorithmName, keyLength, iv)
{
	//region Initial variables
	const algorithm = {
		name: algorithmName,
		length: keyLength >> 3,
		iv
	};
	//endregion

	const openSSLKey = openSSLBytesToKey(password, iv.slice(0, 8), keyLength, 1);

	const key = await crypto.subtle.importKey("raw", openSSLKey, algorithm, false, ["encrypt", "decrypt"]);

	let decryptResult;

	try
	{
		decryptResult = await crypto.subtle.decrypt(algorithm, key, new Uint8Array(encryptedKey));
	}
	catch(ex)
	{
		return new ArrayBuffer(0);
	}

	return decryptResult;
}
//*********************************************************************************
async function parseOpenSSLPrivateKey()
{
	let keyLength = 0;
	let base64 = "";

	const headerExp = /([\x21-\x7e]+):\s*([\x21-\x7e\s^:]+)/;

	const stringPEM = document.getElementById("openssl_data").value.replace(/(-----(BEGIN|END) RSA PRIVATE KEY-----)/g, "");
	const lines = stringPEM.split(/\r?\n/);

	let dekFound = false;
	let iv = new ArrayBuffer(0);

	for(let i = 0; i < lines.length; i++)
	{
		const lineMatch = lines[i].match(headerExp);
		if(lineMatch !== null)
		{
			if(lineMatch[1] === "DEK-Info")
			{
				dekFound = true;

				const values = lineMatch[2].split(",");

				for(let j = 0; j < values.length; j++)
					values[j] = values[j].trim();

				switch(values[0].toLocaleUpperCase())
				{
					case "AES-128-CBC":
						keyLength = 16;
						break;
					case "AES-192-CBC":
						keyLength = 24;
						break;
					case "AES-256-CBC":
						keyLength = 32;
						break;
					default:
						throw new Error(`Unsupported apgorithm ${values[0].toLocaleUpperCase()}`);
				}

				iv = hex2b(values[1]);
			}
		}
		else
		{
			if(dekFound)
				base64 += lines[i];
		}
	}

	if(dekFound === false)
		throw new Error("Can not find DEK-Info section!");

	const dataBuffer = await decryptOpenSSLPrivateKey(stringToArrayBuffer(fromBase64(base64.trim())), stringToArrayBuffer(document.getElementById("password").value), "AES-CBC", keyLength, iv);

	const asn1 = asn1js.fromBER(dataBuffer);
	if(asn1.offset === (-1))
		throw new Error("Incorect encrypted key");

	//const privateKeyInfo = new PrivateKeyInfo({ schema: asn1.result });
	const rsaPrivateKey = new RSAPrivateKey({ schema: asn1.result });

	let resultString = "-----BEGIN RSA PRIVATE KEY-----\r\n";
	//resultString = `${resultString}${formatPEM(toBase64(arrayBufferToString(privateKeyInfo.toSchema().toBER(false))))}`;
	resultString = `${resultString}${formatPEM(toBase64(arrayBufferToString(rsaPrivateKey.toSchema().toBER(false))))}`;
	//resultString = `${resultString}${formatPEM(toBase64(arrayBufferToString(dataBuffer)))}`;
	resultString = `${resultString}\r\n-----END RSA PRIVATE KEY-----\r\n`;

	document.getElementById("pkijs_data").value = resultString;
}
//*********************************************************************************
//endregion 
//*********************************************************************************
context("Hack for Rollup.js", () =>
{
	return;
	
	// noinspection UnreachableCodeJS
	createOpenSSLPrivateKey();
	parseOpenSSLPrivateKey();
	setEngine();
});
//*********************************************************************************
context("OpenSSL Encrypted Private Key", () =>
{
	it("Create And Parse OpenSSP Encrypted Private Key", () =>
	{
	});
});
//*********************************************************************************
