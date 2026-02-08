// scripts/create-market.js
const hre = require("hardhat");
const yargs = require("yargs/yargs");

async function main() {
    
    const argv = yargs(process.argv.slice(2))
        .option("factory", { type: "string", describe: "Factory address" })
        .option("feed", { type: "string", describe: "Feed symbol, e.g., USDC-USD" })
        .option("barrier", { type: "number", describe: "Barrier in ppm, e.g., 985000" })
        .option("window", { type: "number", describe: "Window seconds, e.g., 900" })
        .option("horizon", { type: "number", describe: "Policy horizon seconds, e.g., 604800" })
        .option("lambdaMin", { type: "number", default: 500 })
        .option("lambdaMax", { type: "number", default: 2000 })
        .option("reserve", { type: "number", default: 7000 })
        .option("maxAge", { type: "number", default: 300 })
        .option("signer", { type: "string", describe: "Oracle signer address" })
        .parse();
    
    const factoryAddress = argv.factory || process.env.FACTORY_ADDRESS || argv._[0];
    if (!factoryAddress) {
        throw new Error("Provide factory address via --factory or FACTORY_ADDRESS");
    }
    
    // Validate factory exists
    const code = await hre.ethers.provider.getCode(factoryAddress);
    if (code === "0x") {
        throw new Error(`No contract at ${factoryAddress} on ${hre.network.name}`);
    }
    
    // Parameters
    const feed = argv.feed || process.env.FEED || "USDC-USD";
    const barrierPpm = Number(argv.barrier || process.env.BARRIER_PPM || 985000);
    const windowSec = Number(argv.window || process.env.WINDOW_SEC || 900);
    const horizonSec = Number(argv.horizon || process.env.HORIZON_SEC || 7 * 24 * 60 * 60);
    const lambdaMinBps = Number(argv.lambdaMin || process.env.LAMBDA_MIN_BPS || 500);
    const lambdaMaxBps = Number(argv.lambdaMax || process.env.LAMBDA_MAX_BPS || 2000);
    const reserveBps = Number(argv.reserve || process.env.RESERVE_BPS || 7000);
    const maxPriceAgeSec = Number(argv.maxAge || process.env.MAX_PRICE_AGE || 300);
    const oracleSigner = argv.signer || process.env.ORACLE_SIGNER;
    
    if (!oracleSigner) {
        throw new Error("Provide --signer or ORACLE_SIGNER");
    }
    
    console.log("🏭 Creating Depeg Protection Market\n");
    console.log("Factory:", factoryAddress);
    console.log("Oracle Signer:", oracleSigner);
    console.log("\nMarket Parameters:");
    console.log("  Feed:", feed);
    console.log("  Barrier:", (barrierPpm / 1_000_000).toFixed(6), `(${barrierPpm} ppm)`);
    console.log("  Window:", windowSec, "seconds", `(${windowSec / 60} minutes)`);
    console.log("  Horizon:", horizonSec, "seconds", `(${horizonSec / 86400} days)`);
    console.log("  Lambda Range:", `${lambdaMinBps / 100}% - ${lambdaMaxBps / 100}%`);
    console.log("  Reserve Factor:", `${reserveBps / 100}%`);
    console.log("  Max Price Age:", maxPriceAgeSec, "seconds");
    
    const factory = await hre.ethers.getContractAt("DepegProtectionFactory", factoryAddress);
    
    console.log("\n⏳ Creating market...");
    const tx = await factory.createMarket(
        feed,
        barrierPpm,
        windowSec,
        horizonSec,
        lambdaMinBps,
        lambdaMaxBps,
        reserveBps,
        maxPriceAgeSec,
        oracleSigner
    );
    
    console.log("📝 Transaction:", tx.hash);
    console.log("⏳ Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ Confirmed in block:", receipt.blockNumber);
    
    // Get market address from event
    const event = receipt.logs.find(log => {
        try {
            const parsed = factory.interface.parseLog(log);
            return parsed.name === "MarketCreated";
        } catch {
            return false;
        }
    });
    
    if (event) {
        const parsed = factory.interface.parseLog(event);
        const marketAddress = parsed.args.market;
        const index = parsed.args.index;
        
        console.log("\n🎯 Market Created:");
        console.log("  Index:", index.toString());
        console.log("  Address:", marketAddress);
        console.log("  Feed ID:", parsed.args.feedId);
        
        console.log("\n🔗 View on Explorer:");
        console.log(`  https://coston2-explorer.flare.network/address/${marketAddress}`);
        
        console.log("\n💡 Add to .env:");
        console.log(`  MARKET_ADDRESS=${marketAddress}`);
        
        console.log("\n📋 Next Steps:");
        console.log("1. Add liquidity:");
        console.log(`   MARKET_ADDRESS=${marketAddress} AMOUNT=100 npx hardhat run scripts/add-liquidity.js --network coston2`);
        console.log("\n2. Buy protection:");
        console.log(`   MARKET_ADDRESS=${marketAddress} NOTIONAL=10 npx hardhat run scripts/buy-protection.js --network coston2`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
