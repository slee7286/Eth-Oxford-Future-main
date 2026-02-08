// scripts/buy-protection.js
const hre = require("hardhat");
const axios = require("axios");

async function fetchFlrUsdFromOracle(oracleUrl) {
  try {
    const res = await axios.get(`${oracleUrl}/index/flr-usd`, { timeout: 5000 });
    if (!res.data || !res.data.ok) {
      throw new Error(res.data?.error || "Oracle returned error");
    }
    const { price } = res.data.data; // USD per FLR
    if (!price || !Number.isFinite(price)) {
      throw new Error("Invalid FLR price from oracle");
    }
    return price;
  } catch (e) {
    console.error("⚠️ Failed to fetch FLR/USD from oracle:", e.message);
    return null;
  }
}

async function main() {
  const marketAddress = process.env.MARKET_ADDRESS || process.argv[2];
  if (!marketAddress) {
    console.error("❌ Please provide market address:");
    console.error("   MARKET_ADDRESS=0x... npx hardhat run scripts/buy-protection.js --network coston2");
    process.exit(1);
  }

  console.log("🛡️  Buying Depeg Protection\n");
  console.log("Market:", marketAddress);

  const [buyer] = await hre.ethers.getSigners();
  console.log("Buyer:", buyer.address);

  // Load artifact and interface
  const artifact = await hre.artifacts.readArtifact("DepegProtectionMarket");
  const iface = new hre.ethers.Interface(artifact.abi);

  console.log("buyProtection selector:", iface.getFunction("buyProtection").selector);

  // For reads, still use a Contract helper
  const market = new hre.ethers.Contract(marketAddress, artifact.abi, buyer);

  // ===== Read market config =====
  const config = await market.getConfig();
  const feedId = config[0];
  const barrierPpm = config[1];
  const horizonSec = config[3];

  console.log("\n📋 Market Configuration:");
  console.log("  Feed ID:", feedId);
  console.log("  Barrier:", (Number(barrierPpm) / 1_000_000).toFixed(6));
  console.log("  Horizon:", Number(horizonSec) / 86400, "days");

  // ===== Notional parameters =====
  const notional = process.env.NOTIONAL || "10";
  const notionalWei = hre.ethers.parseEther(notional);

  console.log("\n💼 Protection Details:");
  console.log("  Notional:", notional, "C2FLR");

  const oracleUrl = process.env.ORACLE_URL || "http://localhost:3000";
  const stablecoin = process.env.STABLECOIN || "USDC";

  // ===== FLR/USD via your Oracle (for UX only) =====
  const flrUsdPrice = await fetchFlrUsdFromOracle(oracleUrl);
  if (flrUsdPrice !== null) {
    const notionalNum = Number(notional);
    const notionalUsd = notionalNum * flrUsdPrice;
    console.log(
      `  ≈ ${notionalUsd.toFixed(2)} USD equivalent (1 C2FLR ≈ 1 FLR at ${flrUsdPrice.toFixed(4)} USD/FLR)`
    );
    console.log(
      `  ≈ ${notionalUsd.toFixed(2)} ${stablecoin} notional (treating ${stablecoin} ≈ 1 USD)`
    );
  }

  // ===== Fetch protection quote from oracle =====
  console.log("\n🔮 Fetching quote from oracle...");
  console.log("  Oracle:", oracleUrl);
  console.log("  Stablecoin:", stablecoin);

  let quoteResponse;
  try {
    quoteResponse = await axios.post(`${oracleUrl}/quote/protection`, {
      stablecoin,
      marketAddress,
      barrierPpm: Number(barrierPpm).toString(),
      horizonSec: Number(horizonSec).toString(),
    });
  } catch (error) {
    console.error("\n❌ Failed to get quote from oracle!");
    console.error("  Make sure oracle server is running:");
    console.error("  cd oracle && node server.js");
    throw error;
  }

  const quote = quoteResponse.data.data;

  console.log("\n📊 Oracle Quote:");
  console.log("  Probability:", quote.pBps, "bps", `(${(quote.probability * 100).toFixed(2)}%)`);
  console.log("  Current Price:", (quote.currentPpm / 1_000_000).toFixed(6));
  console.log("  Distance to Barrier:", (quote.distance * 100).toFixed(3), "%");
  console.log("  Volatility:", (quote.volatility * 100).toFixed(2), "%");
  console.log("  Issued At:", new Date(quote.issuedAt * 1000).toISOString());

  // ===== Premium calculation =====
  const premium = await market.quotePremium(notionalWei, quote.pBps); // bigint
  const premiumC2Flr = Number(hre.ethers.formatEther(premium));

  console.log("\n💵 Premium Calculation:");
  console.log("  Base Premium:", premiumC2Flr.toString(), "C2FLR");

  const lambdaBps = await market.currentLambdaBps();   // bigint
  const utilizationBps = await market.utilizationBps(); // bigint

  console.log("  Current Lambda:", Number(lambdaBps) / 100, "%");
  console.log("  Utilization:", Number(utilizationBps) / 100, "%");

  if (flrUsdPrice !== null) {
    const premiumUsd = premiumC2Flr * flrUsdPrice;
    console.log(
      `  ≈ ${premiumUsd.toFixed(4)} USD premium (via FDC FLR/USD at ${flrUsdPrice.toFixed(4)} USD/FLR)`
    );
    console.log(
      `  ≈ ${premiumUsd.toFixed(4)} ${stablecoin} premium (treating ${stablecoin} ≈ 1 USD)`
    );
  }

  // ===== Balance check =====
  const balance = await hre.ethers.provider.getBalance(buyer.address);
  if (balance < premium) {
    console.error("\n❌ Insufficient balance for premium!");
    console.error("  Required:", hre.ethers.formatEther(premium), "C2FLR");
    console.error("  Available:", hre.ethers.formatEther(balance), "C2FLR");
    process.exit(1);
  }

  // ===== Capacity debug =====
  const totalLiquidity = await market.totalLiquidity();
  const outstandingExposure = await market.outstandingExposure();
  const reserveFactorBps = await market.reserveFactorBps();

  const cap = (totalLiquidity * reserveFactorBps) / 10000n;
  const newExposure = outstandingExposure + notionalWei;

  console.log("\n🏦 Capacity Debug:");
  console.log("  totalLiquidity:", hre.ethers.formatEther(totalLiquidity), "C2FLR");
  console.log("  outstandingExposure:", hre.ethers.formatEther(outstandingExposure), "C2FLR");
  console.log("  reserveFactorBps:", reserveFactorBps.toString());
  console.log("  cap:", hre.ethers.formatEther(cap), "C2FLR");
  console.log("  newExposure if buy:", hre.ethers.formatEther(newExposure), "C2FLR");

  if (newExposure > cap) {
    console.error("  -> This buy would exceed capacity; CAPACITY would revert.");
    // For now we just log; you can exit if you want.
  }

  // ===== Encode calldata for buyProtection =====
  const calldata = iface.encodeFunctionData("buyProtection", [
    notionalWei,
    quote.pBps,
    quote.issuedAt,
    quote.signature,
  ]);

  console.log("\nEncoded calldata for buyProtection:");
  console.log(calldata);

  // Convert premium (bigint) to 0x-prefixed hex string for value
  const valueHex = "0x" + premium.toString(16);

  // ===== Send raw tx via provider =====
  console.log("\n⏳ Buying protection (manual calldata via provider)...");
  try {
    const txHash = await hre.ethers.provider.send("eth_sendTransaction", [{
      from: buyer.address,
      to: marketAddress,
      data: calldata,
      value: valueHex,  // 0x-prefixed hex
    }]);

    console.log("📝 buyProtection tx hash:", txHash);
    console.log("⏳ Waiting for confirmation...");

    // Wait using raw JSON-RPC, since HardhatEthersProvider.waitForTransaction is not implemented
    const networkProvider = hre.network.provider;

    async function waitForTx(hash) {
      while (true) {
        const receipt = await networkProvider.send("eth_getTransactionReceipt", [hash]);
        if (receipt && receipt.blockNumber) {
          return receipt;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    const receipt = await waitForTx(txHash);
    console.log("Receipt:", receipt);

    const status = receipt.status === "0x1" ? 1 : 0;
    console.log("✅ Receipt status:", status);

    if (status !== 1) {
      console.error("\n❌ Transaction reverted on-chain.");
      console.log("Check this tx on explorer:");
      console.log(`  https://coston2-explorer.flare.network/tx/${txHash}`);
      process.exit(1);
    }

    // Try to parse PolicyBought event
    const event = receipt.logs.find((log) => {
      try {
        const parsed = iface.parseLog(log);
        return parsed.name === "PolicyBought";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = iface.parseLog(event);
      const policyId = parsed.args.id;
      const expiry = parsed.args.expiry;

      const notionalC2Flr = Number(hre.ethers.formatEther(parsed.args.notional));
      const premiumPaidC2Flr = Number(hre.ethers.formatEther(parsed.args.premium));

      console.log("\n🎉 Protection Purchased!");
      console.log("  Policy ID:", policyId.toString());
      console.log("  Notional:", notionalC2Flr.toString(), "C2FLR");
      console.log("  Premium Paid:", premiumPaidC2Flr.toString(), "C2FLR");
      console.log("  Expiry:", new Date(Number(expiry) * 1000).toISOString());

      if (flrUsdPrice !== null) {
        const notionalUsd = notionalC2Flr * flrUsdPrice;
        const premiumUsd = premiumPaidC2Flr * flrUsdPrice;
        console.log(
          `  Notional ≈ ${notionalUsd.toFixed(2)} USD (${notionalUsd.toFixed(2)} ${stablecoin} equivalent)`
        );
        console.log(
          `  Premium  ≈ ${premiumUsd.toFixed(4)} USD (${premiumUsd.toFixed(4)} ${stablecoin} equivalent)`
        );
      }

      console.log("\n🔗 View on Explorer:");
      console.log(`  https://coston2-explorer.flare.network/tx/${txHash}`);

      console.log("\n💡 To claim (if triggered):");
      console.log(
        `  MARKET_ADDRESS=${marketAddress} POLICY_ID=${policyId} npx hardhat run scripts/claim.js --network coston2`
      );
    } else {
      console.warn("⚠️ No PolicyBought event found in logs.");
      console.log("Check tx on explorer for more details:");
      console.log(`  https://coston2-explorer.flare.network/tx/${txHash}`);
    }
  } catch (e) {
    console.error("\n❌ buyProtection (manual) reverted or failed");
    console.error(e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});