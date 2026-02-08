const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(bal), "C2FLR");

  if (bal === 0n) {
    console.log("ERROR: No C2FLR! Get some from https://faucet.flare.network/coston2");
    return;
  }

  const strikePrice = parseInt(process.env.STRIKE_PRICE || "50");
  const expiryHours = parseInt(process.env.EXPIRY_HOURS || "48");
  const expirySeconds = expiryHours * 3600;

  console.log(`\nConfig: strikePrice=${strikePrice}, expiry=${expiryHours}h (${expirySeconds}s)`);

  // Deploy GasCapFutures
  console.log("\nDeploying GasCapFutures...");
  const FuturesFactory = await hre.ethers.getContractFactory("GasCapFutures");
  const futures = await FuturesFactory.deploy(
    strikePrice,
    expirySeconds,
    "GasCap ETH Gas Futures",
    "Gas price futures settled via Flare FTSO oracle - ETH Oxford 2026"
  );
  await futures.waitForDeployment();
  const futuresAddr = await futures.getAddress();

  // Deploy GasCapFuturesFactory
  console.log("Deploying GasCapFuturesFactory...");
  const FactoryContract = await hre.ethers.getContractFactory("GasCapFuturesFactory");
  const factory = await FactoryContract.deploy();
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();

  console.log("\n========================================");
  console.log("  GasCapFutures deployed to:", futuresAddr);
  console.log("  GasCapFuturesFactory deployed to:", factoryAddr);
  console.log("  Strike Price:", strikePrice, "gwei");
  console.log("  Expiry:", expiryHours, "hours from now");
  console.log("========================================");
  console.log("\nUpdate gascap-frontend/src/lib/config.ts:");
  console.log("  CONTRACT_ADDRESS: '" + futuresAddr + "'");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
