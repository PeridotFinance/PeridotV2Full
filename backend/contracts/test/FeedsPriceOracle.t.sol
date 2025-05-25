// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "forge-std/Test.sol";
import "../contracts/FeedsPriceOracle.sol";
import "../contracts/PToken.sol";

// Mock Feed Aggregator for testing
contract MockFeedAggregator {
    uint256 private _latestAnswer;
    uint8 private _decimals;
    uint256 private _updatedAt;
    uint80 private _roundId;
    string private _description;

    constructor(
        uint256 initialPrice,
        uint8 decimals_,
        string memory description_
    ) {
        _latestAnswer = initialPrice;
        _decimals = decimals_;
        _updatedAt = block.timestamp;
        _roundId = 1;
        _description = description_;
    }

    function latestAnswer() external view returns (uint256) {
        return _latestAnswer;
    }

    function latestRoundData()
        external
        view
        returns (uint80, uint256, uint256, uint256, uint80)
    {
        return (_roundId, _latestAnswer, block.timestamp, _updatedAt, _roundId);
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function latestRound() external view returns (uint256) {
        return _roundId;
    }

    function owner() external view returns (address) {
        return address(this);
    }

    function description() external view returns (string memory) {
        return _description;
    }

    // Test helper functions
    function updatePrice(uint256 newPrice) external {
        _latestAnswer = newPrice;
        _updatedAt = block.timestamp;
        _roundId++;
    }

    function setStaleTimestamp(uint256 timestamp) external {
        _updatedAt = timestamp;
    }
}

// Mock PToken for testing
contract MockPToken {
    string private _symbol;
    address private _underlying;

    constructor(string memory symbol_, address underlying_) {
        _symbol = symbol_;
        _underlying = underlying_;
    }

    function symbol() external view returns (string memory) {
        return _symbol;
    }

    function underlying() external view returns (address) {
        return _underlying;
    }
}

contract FeedsPriceOracleTest is Test {
    FeedsPriceOracle public oracle;
    MockFeedAggregator public ethFeed;
    MockFeedAggregator public btcFeed;
    MockFeedAggregator public usdcFeed;

    FeedsAccess public ethFeedsAccess;
    FeedsAccess public btcFeedsAccess;
    FeedsAccess public usdcFeedsAccess;

    MockPToken public pETH;
    MockPToken public pBTC;
    MockPToken public pUSDC;

    address constant WETH = address(0x1);
    address constant WBTC = address(0x2);
    address constant USDC = address(0x3);
    address constant ETH_PLACEHOLDER =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    uint256 constant DEFAULT_STALE_THRESHOLD = 3600; // 1 hour

    address owner;
    address admin;
    address user;

    function setUp() public {
        owner = address(this);
        admin = address(0x100);
        user = address(0x200);

        // Deploy oracle
        oracle = new FeedsPriceOracle(DEFAULT_STALE_THRESHOLD);

        // Deploy mock feed aggregators
        ethFeed = new MockFeedAggregator(2000 * 10 ** 8, 8, "ETH/USD"); // $2000 with 8 decimals
        btcFeed = new MockFeedAggregator(50000 * 10 ** 8, 8, "BTC/USD"); // $50000 with 8 decimals
        usdcFeed = new MockFeedAggregator(1 * 10 ** 6, 6, "USDC/USD"); // $1 with 6 decimals

        // Deploy FeedsAccess contracts
        ethFeedsAccess = new FeedsAccess(address(ethFeed));
        btcFeedsAccess = new FeedsAccess(address(btcFeed));
        usdcFeedsAccess = new FeedsAccess(address(usdcFeed));

        // Deploy mock pTokens
        pETH = new MockPToken("pETH", ETH_PLACEHOLDER);
        pBTC = new MockPToken("pBTC", WBTC);
        pUSDC = new MockPToken("pUSDC", USDC);

        // Set up admin
        oracle.setAdmin(admin);

        // Register feeds
        vm.startPrank(admin);
        oracle.registerFeed(ETH_PLACEHOLDER, address(ethFeedsAccess));
        oracle.registerFeed(WBTC, address(btcFeedsAccess));
        oracle.registerFeed(USDC, address(usdcFeedsAccess));
        vm.stopPrank();
    }

    function testInitialSetup() public {
        assertEq(oracle.getOwner(), owner);
        assertTrue(oracle.admin(owner));
        assertTrue(oracle.admin(admin));
        assertEq(oracle.defaultStaleThreshold(), DEFAULT_STALE_THRESHOLD);
    }

    function testRegisterFeed() public {
        address newAsset = address(0x999);
        address newFeedsAccess = address(0x888);

        vm.prank(admin);
        oracle.registerFeed(newAsset, newFeedsAccess);

        assertEq(oracle.assetToFeedsAccess(newAsset), newFeedsAccess);
    }

    function testRegisterFeedOnlyAdmin() public {
        address newAsset = address(0x999);
        address newFeedsAccess = address(0x888);

        vm.prank(user);
        vm.expectRevert("Only admin can call this function");
        oracle.registerFeed(newAsset, newFeedsAccess);
    }

    function testGetUnderlyingPriceETH() public {
        uint256 price = oracle.getUnderlyingPrice(PToken(address(pETH)));
        // ETH price: 2000 * 10^8 (8 decimals) -> 2000 * 10^18 (18 decimals)
        assertEq(price, 2000 * 10 ** 18);
    }

    function testGetUnderlyingPriceBTC() public {
        uint256 price = oracle.getUnderlyingPrice(PToken(address(pBTC)));
        // BTC price: 50000 * 10^8 (8 decimals) -> 50000 * 10^18 (18 decimals)
        assertEq(price, 50000 * 10 ** 18);
    }

    function testGetUnderlyingPriceUSDC() public {
        uint256 price = oracle.getUnderlyingPrice(PToken(address(pUSDC)));
        // USDC price: 1 * 10^6 (6 decimals) -> 1 * 10^18 (18 decimals)
        assertEq(price, 1 * 10 ** 18);
    }

    function testPriceUpdate() public {
        // Update ETH price to $2500
        ethFeed.updatePrice(2500 * 10 ** 8);

        uint256 price = oracle.getUnderlyingPrice(PToken(address(pETH)));
        assertEq(price, 2500 * 10 ** 18);
    }

    function testStalePrice() public {
        // Advance time to ensure we have a meaningful block.timestamp
        vm.warp(block.timestamp + 7200); // Advance by 2 hours

        // Make the price stale by setting old timestamp
        // Set timestamp to a time that's definitely stale (more than threshold ago)
        uint256 staleTimestamp = block.timestamp > DEFAULT_STALE_THRESHOLD + 100
            ? block.timestamp - DEFAULT_STALE_THRESHOLD - 100
            : 1; // Use 1 instead of 0 to ensure it's definitely stale
        ethFeed.setStaleTimestamp(staleTimestamp);

        // Should revert due to stale price
        vm.expectRevert();
        oracle.getUnderlyingPrice(PToken(address(pETH)));
    }

    function testStalePriceWithCachedFallback() public {
        // First, update cached price
        vm.prank(admin);
        oracle.updateCachedPrice(ETH_PLACEHOLDER);

        // Advance time to ensure we have a meaningful block.timestamp
        vm.warp(block.timestamp + 7200); // Advance by 2 hours

        // Make the price stale
        // Set timestamp to a time that's definitely stale (more than threshold ago)
        uint256 staleTimestamp = block.timestamp > DEFAULT_STALE_THRESHOLD + 100
            ? block.timestamp - DEFAULT_STALE_THRESHOLD - 100
            : 1; // Use 1 instead of 0 to ensure it's definitely stale
        ethFeed.setStaleTimestamp(staleTimestamp);

        // Should return cached price
        uint256 price = oracle.getUnderlyingPrice(PToken(address(pETH)));
        assertEq(price, 2000 * 10 ** 18);
    }

    function testUpdateCachedPrice() public {
        vm.prank(admin);
        oracle.updateCachedPrice(ETH_PLACEHOLDER);

        assertEq(
            oracle.lastValidFeedsPriceMantissa(ETH_PLACEHOLDER),
            2000 * 10 ** 18
        );
    }

    function testSetManualPrice() public {
        uint256 manualPrice = 3000 * 10 ** 18;

        vm.prank(admin);
        oracle.setUnderlyingPrice(PToken(address(pETH)), manualPrice);

        // Unregister the feed to test manual price fallback
        vm.prank(admin);
        oracle.registerFeed(ETH_PLACEHOLDER, address(0));

        uint256 price = oracle.getUnderlyingPrice(PToken(address(pETH)));
        assertEq(price, manualPrice);
    }

    function testSetDirectPrice() public {
        uint256 directPrice = 4000 * 10 ** 18;

        vm.prank(admin);
        oracle.setDirectPrice(ETH_PLACEHOLDER, directPrice);

        // Unregister the feed to test manual price fallback
        vm.prank(admin);
        oracle.registerFeed(ETH_PLACEHOLDER, address(0));

        uint256 price = oracle.assetPrices(ETH_PLACEHOLDER);
        assertEq(price, directPrice);
    }

    function testAssetStaleThreshold() public {
        uint256 customThreshold = 1800; // 30 minutes

        vm.prank(admin);
        oracle.setAssetStaleThreshold(ETH_PLACEHOLDER, customThreshold);

        assertEq(oracle.feedsStaleThreshold(ETH_PLACEHOLDER), customThreshold);

        // Advance time to ensure we have a meaningful block.timestamp
        vm.warp(block.timestamp + 3600); // Advance by 1 hour

        // Make price stale according to custom threshold but not default
        // Set timestamp to a time that's definitely stale (more than custom threshold ago)
        uint256 staleTimestamp = block.timestamp > customThreshold + 100
            ? block.timestamp - customThreshold - 100
            : 1; // Use 1 instead of 0 to ensure it's definitely stale
        ethFeed.setStaleTimestamp(staleTimestamp);

        vm.expectRevert();
        oracle.getUnderlyingPrice(PToken(address(pETH)));
    }

    function testDefaultStaleThreshold() public {
        uint256 newDefaultThreshold = 7200; // 2 hours

        oracle.setDefaultStaleThreshold(newDefaultThreshold);
        assertEq(oracle.defaultStaleThreshold(), newDefaultThreshold);
    }

    function testDeployFeedsAccess() public {
        MockFeedAggregator newFeed = new MockFeedAggregator(
            100 * 10 ** 8,
            8,
            "TEST/USD"
        );

        vm.prank(admin);
        address feedsAccessAddr = oracle.deployFeedsAccess(address(newFeed));

        assertTrue(feedsAccessAddr != address(0));

        // Test the deployed FeedsAccess
        FeedsAccess feedsAccess = FeedsAccess(feedsAccessAddr);
        assertEq(feedsAccess.fetchLatestAnswer(), 100 * 10 ** 8);
    }

    function testAdminManagement() public {
        address newAdmin = address(0x300);

        // Add admin
        oracle.setAdmin(newAdmin);
        assertTrue(oracle.admin(newAdmin));

        // Remove admin
        oracle.removeAdmin(newAdmin);
        assertFalse(oracle.admin(newAdmin));
    }

    function testOwnershipTransfer() public {
        address newOwner = address(0x400);

        oracle.setOwner(newOwner);
        assertEq(oracle.getOwner(), newOwner);
    }

    function testOnlyOwnerFunctions() public {
        vm.prank(user);
        vm.expectRevert("Only owner can call this function");
        oracle.setDefaultStaleThreshold(1000);

        vm.prank(user);
        vm.expectRevert("Only owner can call this function");
        oracle.setAdmin(user);

        vm.prank(user);
        vm.expectRevert("Only owner can call this function");
        oracle.removeAdmin(admin);

        vm.prank(user);
        vm.expectRevert("Only owner can call this function");
        oracle.setOwner(user);
    }

    function testAssetPricesFunction() public {
        uint256 price = oracle.assetPrices(ETH_PLACEHOLDER);
        assertEq(price, 2000 * 10 ** 18);

        price = oracle.assetPrices(WBTC);
        assertEq(price, 50000 * 10 ** 18);

        price = oracle.assetPrices(USDC);
        assertEq(price, 1 * 10 ** 18);
    }

    function testFeedsAccessFunctions() public {
        // Test ETH feeds access
        assertEq(ethFeedsAccess.fetchLatestAnswer(), 2000 * 10 ** 8);
        assertEq(ethFeedsAccess.getDecimals(), 8);
        assertEq(ethFeedsAccess.getDescription(), "ETH/USD");

        (
            uint80 roundId,
            uint256 price,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = ethFeedsAccess.fetchLatestRoundData();

        assertEq(price, 2000 * 10 ** 8);
        assertTrue(updatedAt > 0);
    }

    function testInvalidFeedAggregator() public {
        vm.prank(admin);
        vm.expectRevert("Invalid feed aggregator address");
        oracle.deployFeedsAccess(address(0));
    }

    function testNoFeedRegistered() public {
        address unregisteredAsset = address(0x999);

        vm.expectRevert("No feed registered for asset");
        oracle.updateCachedPrice(unregisteredAsset);
    }

    receive() external payable {}
}
