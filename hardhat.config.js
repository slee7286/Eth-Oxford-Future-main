require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "london",
      viaIR: true
    }
  },
  networks: {
    coston2: {
      url: "https://coston2-api.flare.network/ext/C/rpc",
      chainId: 114,
      accounts: process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length >= 64 ? [process.env.PRIVATE_KEY] : [],
    }
  }
};
