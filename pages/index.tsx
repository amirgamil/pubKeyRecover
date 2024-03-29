import { BigNumber, ethers } from "ethers";
import type { NextPage } from "next";
import Head from "next/head";
import React from "react";
import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import styles from "../styles/Home.module.css";

const ecrecover = async (rawHexData: string): Promise<ComputedFields | undefined> => {
    try {
        let transactionHashData;
        let signature;
        let v;
        let r;
        let s;
        //Post EIP-1559 raw transaction hex
        if (rawHexData.startsWith("0x02")) {
            //remove the 0x02 before rlp decoding
            const [
                chainId,
                nonce,
                maxPriorityGasFee,
                maxFeePerGas,
                gasLimit,
                destination,
                amount,
                data,
                ,
                vconst,
                rconst,
                sconst,
            ] = ethers.utils.RLP.decode("0x" + rawHexData.trim().substring(4));

            [v, r, s] = [vconst, rconst, sconst];

            transactionHashData = {
                gasLimit: BigNumber.from(gasLimit),
                maxFeePerGas: BigNumber.from(maxFeePerGas),
                maxPriorityFeePerGas: BigNumber.from(maxPriorityGasFee),
                type: 2,
                to: ethers.utils.getAddress(destination),
                chainId: parseInt(chainId),
                nonce: parseInt(nonce),
                value: amount !== "0x" ? BigNumber.from(amount) : BigNumber.from(0),
                data: data,
            };

            if (v === undefined || !r || !s) {
                throw new Error("Undefined r, s, or v");
            }

            //yes this is hacky, ik numbers in javascript suck
            const expandedSig = { r: r, s: s, v: v === "0x" ? 0 : 1 };
            signature = ethers.utils.joinSignature(expandedSig);
        } else {
            const messageLowerCase = rawHexData.trim().toLowerCase();
            if (!messageLowerCase.match(/^0x([0-9a-f]{2})*$/)) throw new Error("Invalid hex string");
            transactionHashData = ethers.utils.parseTransaction(messageLowerCase);
            if (!transactionHashData.r || !transactionHashData.s || transactionHashData.v === undefined) {
                throw new Error("Undefined r, s, or v");
            }

            signature = ethers.utils.hexlify(
                ethers.utils.concat([
                    transactionHashData.r,
                    transactionHashData.s,
                    transactionHashData.v % 2 === 1 ? "0x1b" : "0x1c",
                ])
            );
            [v, r, s] = [transactionHashData.v, transactionHashData.r, transactionHashData.s];
            delete transactionHashData.hash;
            delete transactionHashData.from;
            delete transactionHashData.v;
            delete transactionHashData.r;
            delete transactionHashData.s;
        }

        //@ts-ignore
        const rstransactionHash = await ethers.utils.resolveProperties(transactionHashData);
        //@ts-ignore
        const raw = ethers.utils.serializeTransaction(rstransactionHash); // returns RLP encoded transactionHash
        const msgHash = ethers.utils.keccak256(raw); // as specified by ECDSA
        const msgBytes = ethers.utils.arrayify(msgHash); // create binary hash

        const publicKey = ethers.utils.recoverPublicKey(msgBytes, signature);
        const compressedKey = ethers.utils.computePublicKey(publicKey, true);
        const hashedPublicKey = ethers.utils.keccak256(ethers.utils.hexDataSlice(publicKey, 1));
        const address = ethers.utils.computeAddress(publicKey);

        return { publicKey, compressedKey, hashedPublicKey, address, v, r, s, signature };
    } catch (ex: unknown) {
        toast.error("Uh oh, something went wrong");
        return undefined;
    }
};

interface ComputedFields {
    publicKey: string;
    compressedKey: string;
    hashedPublicKey: string;
    address: string;
    v: string;
    r: string;
    s: string;
    signature: string;
}

const Home: NextPage = () => {
    const [rawTxHash, setRawTxHash] = useState("");
    const [computedFields, setComputedFields] = useState<ComputedFields | undefined>(undefined);

    const updateFields = async (rawHash: string) => {
        const result = await ecrecover(rawHash);
        setComputedFields(result);
    };

    return (
        <div className={styles.container}>
            <Head>
                <title>Pubkey recover</title>
                <meta name="description" content="Recover a public key from raw Ethereum tx data" />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main className={styles.main}>
                <h3 className={styles.title}>Recover public key from raw Ethereum tx data</h3>
                <div className="py-4"></div>
                <p>
                    This is a tool to help recover public keys from Ethereum raw tx data, which supports both{" "}
                    <a href="https://eips.ethereum.org/EIPS/eip-1559">EIP-1559</a> tx/s and{" "}
                    <a href="https://eips.ethereum.org/EIPS/eip-155">EIP-155</a> tx/s (i.e. before EIP-1559).
                </p>
                <div className="py-3"></div>
                <div>
                    <h4 className="font-bold font-xl">Background Info</h4>
                    <div className="py-2"></div>
                    <p>Public keys are either</p>
                    <div>
                        1. 65 bytes long and look like
                        <div className="py-1"></div>
                        <code className="text-xs">
                            <span style={{ color: "red" }}>0x04</span> || uncompressed public key
                        </code>
                        <div className="py-3"></div>
                        2. 33 bytes long and look like <br></br>
                        <div className="py-1"></div>
                        <code className="text-xs">
                            <span style={{ color: "red" }}>0x02</span> or <span style={{ color: "red" }}>0x03</span> ||
                            compressed public key
                        </code>
                    </div>
                    <div className="py-2"></div>
                    <p>
                        <span style={{ color: "#04EBFB" }}>Ethereum addresses</span> are the last 20 bytes of the hash
                        of the uncompressed public key{" "}
                    </p>
                </div>

                <div className="py-2"></div>
                <input
                    type="text"
                    placeholder="Enter raw tx data (in hex)"
                    value={rawTxHash}
                    onChange={(e) => setRawTxHash(e.target.value)}
                />
                <div className="py-4"></div>
                <button onClick={() => updateFields(rawTxHash)}>Recover public key</button>
                <div className="py-4"></div>

                {computedFields && (
                    <div style={{ wordBreak: "break-word" }}>
                        <p>
                            <strong>Public key: </strong>
                            <span style={{ color: "red" }}>{computedFields.publicKey.substring(0, 4)}</span>
                            <span>{computedFields.publicKey.substring(4)}</span>
                        </p>
                        <br></br>
                        <p>
                            <strong>Compressed public key: </strong>
                            <span style={{ color: "red" }}>{computedFields.compressedKey.substring(0, 4)}</span>
                            <span>{computedFields.compressedKey.substring(4)}</span>
                        </p>
                        <br></br>
                        <p>
                            <strong>Hash of uncompressed public key: </strong>
                            <span>
                                {computedFields.hashedPublicKey.substring(
                                    0,
                                    computedFields.hashedPublicKey.length - 40
                                )}
                            </span>
                            <span style={{ color: "#04EBFB" }}>
                                {computedFields.hashedPublicKey.substring(computedFields.hashedPublicKey.length - 40)}
                            </span>
                        </p>
                        <br></br>
                        <p>
                            <strong>Recovered address: </strong>
                            {computedFields.address}
                        </p>
                        <br></br>
                        <p>
                            <strong>v: </strong>
                            {computedFields.v}
                        </p>
                        <br></br>
                        <p>
                            <strong>r: </strong>
                            {computedFields.r}
                        </p>
                        <br></br>
                        <p>
                            <strong>s: </strong>
                            {computedFields.s}
                        </p>
                        <br></br>
                        <p>
                            <strong>signature: </strong>
                            {computedFields.signature}
                        </p>
                        <br></br>
                    </div>
                )}
                <footer className={styles.footer}>
                    Built by <a href="https://twitter.com/amirbolous">Amir</a> and{" "}
                    <a href="https://github.com/amirgamil/pubKeyRecover">open source</a> on Github
                </footer>
                <Toaster />
            </main>
        </div>
    );
};

export default Home;
