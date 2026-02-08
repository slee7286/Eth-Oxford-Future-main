// scripts/add-liquidity.js
const hre = require("hardhat");

async function main() {
    const marketAddress = process.env.MARKET_ADDRESS || process.argv[2];
    
    if (!marketAddress) {
        console.error("❌ Please provide market address:");
        console.error("   MARKET_ADDRESS=0x... npx hardhat run scripts/add-liquidity.js --network coston2");
        process.exit(1);
    }
    
    console.log("💰 Adding Liquidity to Depeg Protection Market\n");
    console.log("Market:", marketAddress);
    
    const market = await hre.ethers.getContractAt("DepegProtectionMarket", marketAddress);
    const [signer] = await hre.ethers.getSigners();
    
    console.log("LP:", signer.address);
    
    const balance = await hre.ethers.provider.getBalance(signer.address);
    console.log("Balance:", hre.ethers.formatEther(balance), "C2FLR");
    
    // Amount from env or default
    const amount = process.env.AMOUNT || "10";
    const amountWei = hre.ethers.parseEther(amount);
    
    console.log("\n📊 Current Market State:");
    const totalLiq = await market.totalLiquidity();
    const outstandingExp = await market.outstandingExposure();
    const utilization = await market.utilizationBps();
    const lambda = await market.currentLambdaBps();
    
    console.log("  Total Liquidity:", hre.ethers.formatEther(totalLiq), "C2FLR");
    console.log("  Outstanding Exposure:", hre.ethers.formatEther(outstandingExp), "C2FLR");
    console.log("  Utilization:", (Number(utilization) / 100).toFixed(2), "%");
    console.log("  Current Lambda:", (Number(lambda) / 100).toFixed(2), "%");
    
    console.log("\n💰 Adding Liquidity:");
    console.log("  Amount:", amount, "C2FLR");
    
    if (balance < amountWei) {
        console.error("\n❌ Insufficient balance!");
        console.error("  Required:", amount, "C2FLR");
        console.error("  Available:", hre.ethers.formatEther(balance), "C2FLR");
        process.exit(1);
    }
    
    console.log("\n⏳ Submitting transaction...");
    const tx = await market.addLiquidity({ value: amountWei });
    
    console.log("📝 Transaction:", tx.hash);
    console.log("⏳ Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ Confirmed in block:", receipt.blockNumber);
    
    // Updated state
    const newTotalLiq = await market.totalLiquidity();
    const lpBalance = await market.lpBalances(signer.address);
    
    console.log("\n📊 Updated State:");
    console.log("  Total Liquidity:", hre.ethers.formatEther(newTotalLiq), "C2FLR");
    console.log("  Your LP Balance:", hre.ethers.formatEther(lpBalance), "C2FLR");
    
    console.log("\n🔗 View on Explorer:");
    console.log(`  https://coston2-explorer.flare.network/tx/${tx.hash}`);
    
    console.log("\n✅ Liquidity added successfully!");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
