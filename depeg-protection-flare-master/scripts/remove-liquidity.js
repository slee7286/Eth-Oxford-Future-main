const hre = require("hardhat");

async function main() {
  const marketAddress = process.env.MARKET_ADDRESS || process.argv[2];
  if (!marketAddress) {
    console.error("❌ Please provide market address:");
    console.error("   MARKET_ADDRESS=0x... npx hardhat run scripts/remove-liquidity.js --network coston2");
    process.exit(1);
  }

  console.log("💸 Removing Liquidity from Depeg Protection Market\n");
  console.log("Market:", marketAddress);

  const market = await hre.ethers.getContractAt("DepegProtectionMarket", marketAddress);
  const [signer] = await hre.ethers.getSigners();

  console.log("LP:", signer.address);

  // lpBalance is bigint in ethers v6
  const lpBalance = await market.lpBalances(signer.address);
  console.log("Your LP Balance:", hre.ethers.formatEther(lpBalance), "C2FLR");

  const amount = process.env.AMOUNT || "1"; // Default to 1 if not provided
  const amountWei = hre.ethers.parseEther(amount); // bigint

  // ---- balance check ----
  if (lpBalance < amountWei) {
    console.error("\n❌ Insufficient LP balance!");
    console.error("  Requested:", amount, "C2FLR");
    console.error("  Available:", hre.ethers.formatEther(lpBalance), "C2FLR");
    process.exit(1);
  }

  // ---- read contract parameters ----
  const totalLiquidity = await market.totalLiquidity();          // bigint
  const outstandingExposure = await market.outstandingExposure(); // bigint
  const reserveFactorBps = await market.reserveFactorBps();       // bigint

  // ---- defensive checks ----
  if (totalLiquidity === 0n) {
    console.error("\n❌ Total liquidity is zero, cannot withdraw.");
    process.exit(1);
  }

  // ---- compute minPool = outstandingExposure * 10000 / reserveFactorBps ----
  const TEN_THOUSAND = 10_000n;
  const minPool = (outstandingExposure * TEN_THOUSAND) / reserveFactorBps;

  // ---- LP share and max withdrawable ----
  const ONE_E18 = 1_000_000_000_000_000_000n;

  // lpShare is scaled by 1e18 to maintain precision: (lpBalance / totalLiquidity) * 1e18
  const lpShare = (lpBalance * ONE_E18) / totalLiquidity; // bigint

  const minPoolForLp = (minPool * lpShare) / ONE_E18;

  let maxWithdrawable = lpBalance - minPoolForLp;
  if (maxWithdrawable < 0n) {
    maxWithdrawable = 0n;
  }

  console.log("Minimum Pool Balance Required:", hre.ethers.formatEther(minPool), "C2FLR");
  console.log("Maximum Withdrawable Amount:", hre.ethers.formatEther(maxWithdrawable), "C2FLR");

  // ---- check requested amount vs max withdrawable ----
  if (amountWei > maxWithdrawable) {
    console.error("\n❌ Requested withdrawal exceeds max withdrawable limit!");
    console.error("  Requested:", amount, "C2FLR");
    console.error("  Max Withdrawable:", hre.ethers.formatEther(maxWithdrawable), "C2FLR");
    process.exit(1);
  }

  console.log("\n⏳ Submitting removeLiquidity transaction...");
  const tx = await market.removeLiquidity(amountWei);

  console.log("📝 Transaction:", tx.hash);
  console.log("⏳ Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("✅ Confirmed in block:", receipt.blockNumber);

  const newLpBalance = await market.lpBalances(signer.address);
  const newTotalLiquidity = await market.totalLiquidity();

  console.log("\n📊 Updated State:");
  console.log("  Total Liquidity:", hre.ethers.formatEther(newTotalLiquidity), "C2FLR");
  console.log("  Your LP Balance:", hre.ethers.formatEther(newLpBalance), "C2FLR");

  console.log("\n🔗 View on Explorer:");
  console.log(`  https://coston2-explorer.flare.network/tx/${tx.hash}`);

  console.log("\n✅ Liquidity removed successfully!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});