export const CONFIG = {
  CONTRACT_ADDRESS: '0x973Ca902b10Bb229cB8d90F79E451F1B16aa82B4',
  CHAIN_ID: 114,
  RPC_URL: 'https://coston2-api.flare.network/ext/C/rpc',
  POLL_INTERVAL_MS: 5000,
  EXPLORER_URL: 'https://coston2-explorer.flare.network',
};

// ABI matching the deployed GasCapFutures contract (v3)
// 13-field Position struct, leverage/marginMode params, onlyRegistered modifier
export const ABI = [
  // ── View Functions ──
  "function getContractState() view returns (uint256 strikePrice, uint256 expiryTimestamp, bool isSettled, uint256 settlementPrice, uint256 totalLiquidity, uint256 participantCount)",
  "function getCurrentGasPrice() view returns (uint256 price, uint256 timestamp)",
  "function getPosition(address _trader) view returns (bool exists, bool isLong, uint256 quantity, uint256 collateral, uint256 leverage, uint8 marginMode, uint8 entryType, uint256 entryPrice, uint256 openTimestamp, bool isActive, bool isClaimed, uint256 notionalValue, uint256 margin)",
  "function calculatePayout(address _trader) view returns (uint256)",
  "function getUserProfile(address _user) view returns (bool registered, string username, string metadataURI, uint256 totalTrades, uint256 registeredAt)",
  "function getMarketInfo() view returns (string name, string description, uint256 strike, uint256 expiry, bool settled, uint256 participants)",
  "function getActiveTraders() view returns (uint256)",
  "function login() view returns (bool)",
  "function liquidityProvided(address) view returns (uint256)",
  "function strikePrice() view returns (uint256)",
  "function expiryTimestamp() view returns (uint256)",
  "function isSettled() view returns (bool)",
  "function settlementPrice() view returns (uint256)",
  "function totalLiquidity() view returns (uint256)",
  "function participantCount() view returns (uint256)",
  "function marketName() view returns (string)",
  "function marketDescription() view returns (string)",
  "function owner() view returns (address)",

  // ── User Registration ──
  "function registerUser(string _username, string _metadataURI) external",

  // ── Trading Functions ──
  "function mintLong(uint256 _quantity, uint256 _leverage, uint8 _marginMode) payable",
  "function mintShort(uint256 _quantity, uint256 _leverage, uint8 _marginMode) payable",

  // ── Liquidity Functions ──
  "function addLiquidity() payable",
  "function removeLiquidity(uint256 _amount)",

  // ── Settlement ──
  "function settleContract()",
  "function claimPayout()",

  // ── Events ──
  "event FuturesMinted(address indexed trader, bool isLong, uint256 quantity, uint256 collateral, uint256 leverage, uint8 marginMode, uint8 entryType, uint256 entryPrice, uint256 notionalValue, uint256 margin, uint256 timestamp)",
  "event UserRegistered(address indexed user, string username)",
  "event UserLoggedIn(address indexed user, uint256 timestamp)",
  "event LiquidityAdded(address indexed provider, uint256 amount)",
  "event LiquidityRemoved(address indexed provider, uint256 amount)",
  "event ContractSettled(uint256 settlementPrice)",
  "event PayoutClaimed(address indexed trader, uint256 amount)"
];
