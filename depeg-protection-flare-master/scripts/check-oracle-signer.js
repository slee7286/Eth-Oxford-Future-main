// scripts/check-oracle-signer.js
const hre = require("hardhat");

async function main() {
  const marketAddress = process.env.MARKET_ADDRESS;
  if (!marketAddress) throw new Error("Set MARKET_ADDRESS");

  const artifact = await hre.artifacts.readArtifact("DepegProtectionMarket");
  const [signer] = await hre.ethers.getSigners();
  const market = new hre.ethers.Contract(marketAddress, artifact.abi, signer);

  console.log("oracleSigner:", await market.oracleSigner());
  console.log("maxPriceAgeSec:", (await market.maxPriceAgeSec()).toString());
}

main().catch((e) => { console.error(e); process.exit(1); });
