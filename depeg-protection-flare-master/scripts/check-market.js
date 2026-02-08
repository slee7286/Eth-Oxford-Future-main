// scripts/check-market.js
const hre = require("hardhat");

async function main() {
  const marketAddress = process.env.MARKET_ADDRESS;
  if (!marketAddress) throw new Error("Set MARKET_ADDRESS");

  const code = await hre.ethers.provider.getCode(marketAddress);
  console.log("Code size at", marketAddress, ":", (code.length - 2) / 2, "bytes");

  // 1. Load artifact explicitly
  const artifact = await hre.artifacts.readArtifact("DepegProtectionMarket");
  console.log("Artifact contractName:", artifact.contractName);
  console.log("Artifact ABI length:", Array.isArray(artifact.abi) ? artifact.abi.length : "not array");

  if (!Array.isArray(artifact.abi) || artifact.abi.length === 0) {
    console.error("❌ ABI for DepegProtectionMarket is missing or empty.");
    process.exit(1);
  }

  // 2. Attach contract manually using ethers v6
  const [signer] = await hre.ethers.getSigners();
  const market = new hre.ethers.Contract(marketAddress, artifact.abi, signer);

  console.log("market typeof:", typeof market);
  console.log("market.interface typeof:", typeof market.interface);
  console.log("market.interface:", market.interface);

  if (!market.interface) {
    console.error("❌ market.interface is undefined. Something is wrong with ethers import or Contract construction.");
    process.exit(1);
  }

  // Functions may be a Map-like, not a plain object; convert safely
  const functions = market.interface.fragments.filter((f) => f.type === "function").map((f) => f.format());

  console.log("Functions on DepegProtectionMarket:");
  console.log(functions);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});