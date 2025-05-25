// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "forge-std/Test.sol";
import "../contracts/PluginDirectOracle.sol";
import "../contracts/PToken.sol";

// Mock Plugin Aggregator for testing
contract MockPluginAggregator {
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

contract PluginDirectOracleTest is Test {
    PluginDirectOracle public oracle;
    MockPluginAggregator public xdcAggregator;
    MockPluginAggregator public pliAggregator;
    MockPluginAggregator public btcAggregator;
    MockPluginAggregator public ethAggregator;

    MockPToken public pXDC;
    MockPToken public pPLI;
    MockPToken public pBTC;
    MockPToken public pETH;

    address constant XDC_TOKEN = address(0x1);
    address constant PLI_TOKEN = address(0x2);
    address constant WBTC_TOKEN = address(0x3);
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
        oracle = new PluginDirectOracle(DEFAULT_STALE_THRESHOLD);

        // Deploy mock Plugin aggregators (following Plugin documentation pattern)
        xdcAggregator = new MockPluginAggregator(
            50000000, // $0.50 XDC with 8 decimals (0.50 * 10^8 = 50000000)
            8,
            "XDC/USD"
        );
        pliAggregator = new MockPluginAggregator(
            5 * 10 ** 8, // $5.00 PLI with 8 decimals
            8,
            "PLI/USD"
        );
        btcAggregator = new MockPluginAggregator(
            50000 * 10 ** 8, // $50,000 BTC with 8 decimals
            8,
            "BTC/USD"
        );
        ethAggregator = new MockPluginAggregator(
            2000 * 10 ** 8, // $2,000 ETH with 8 decimals
            8,
            "ETH/USD"
        );

        // Deploy mock pTokens
        pXDC = new MockPToken("pXDC", XDC_TOKEN);
        pPLI = new MockPToken("pPLI", PLI_TOKEN);
        pBTC = new MockPToken("pBTC", WBTC_TOKEN);
        pETH = new MockPToken("pETH", ETH_PLACEHOLDER);

        // Set up admin
        oracle.setAdmin(admin);

        // Deploy and register feeds using Plugin pattern
        vm.startPrank(admin);
        oracle.deployAndRegisterFeed(XDC_TOKEN, address(xdcAggregator));
        oracle.deployAndRegisterFeed(PLI_TOKEN, address(pliAggregator));
        oracle.deployAndRegisterFeed(WBTC_TOKEN, address(btcAggregator));
        oracle.deployAndRegisterFeed(ETH_PLACEHOLDER, address(ethAggregator));
        vm.stopPrank();
    }

    function testInitialSetup() public {
        assertEq(oracle.getOwner(), owner);
        assertTrue(oracle.admin(owner));
        assertTrue(oracle.admin(admin));
        assertEq(oracle.defaultStaleThreshold(), DEFAULT_STALE_THRESHOLD);
    }

    function testDeployAndRegisterFeed() public {
        address newAsset = address(0x999);
        MockPluginAggregator newAggregator = new MockPluginAggregator(
            100 * 10 ** 8,
            8,
            "TEST/USD"
        );

        vm.prank(admin);
        address feedsAccessAddr = oracle.deployAndRegisterFeed(
            newAsset,
            address(newAggregator)
        );

        assertTrue(feedsAccessAddr != address(0));
        assertEq(oracle.assetToFeedsAccess(newAsset), feedsAccessAddr);

        // Test the deployed FeedsAccess
        FeedsAccess feedsAccess = FeedsAccess(feedsAccessAddr);
        assertEq(feedsAccess.fetchLatestAnswer(), 100 * 10 ** 8);
        assertEq(feedsAccess.getDecimals(), 8);
        assertEq(feedsAccess.getDescription(), "TEST/USD");
    }

    function testDeployAndRegisterFeedOnlyAdmin() public {
        address newAsset = address(0x999);
        address newAggregator = address(0x888);

        vm.prank(user);
        vm.expectRevert("Only admin can call this function");
        oracle.deployAndRegisterFeed(newAsset, newAggregator);
    }

    function testGetUnderlyingPriceXDC() public {
        uint256 price = oracle.getUnderlyingPrice(PToken(address(pXDC)));
        // XDC price: 0.50 * 10^8 (8 decimals) -> 0.50 * 10^18 (18 decimals)
        assertEq(price, 50 * 10 ** 16); // 0.50 * 10^18
    }

    function testGetUnderlyingPricePLI() public {
        uint256 price = oracle.getUnderlyingPrice(PToken(address(pPLI)));
        // PLI price: 5 * 10^8 (8 decimals) -> 5 * 10^18 (18 decimals)
        assertEq(price, 5 * 10 ** 18);
    }

    function testGetUnderlyingPriceBTC() public {
        uint256 price = oracle.getUnderlyingPrice(PToken(address(pBTC)));
        // BTC price: 50000 * 10^8 (8 decimals) -> 50000 * 10^18 (18 decimals)
        assertEq(price, 50000 * 10 ** 18);
    }

    function testGetUnderlyingPriceETH() public {
        uint256 price = oracle.getUnderlyingPrice(PToken(address(pETH)));
        // ETH price: 2000 * 10^8 (8 decimals) -> 2000 * 10^18 (18 decimals)
        assertEq(price, 2000 * 10 ** 18);
    }

    function testPriceUpdate() public {
        // Update XDC price to $0.75
        xdcAggregator.updatePrice(75000000); // 0.75 with 8 decimals

        uint256 price = oracle.getUnderlyingPrice(PToken(address(pXDC)));
        assertEq(price, 75 * 10 ** 16); // 0.75 * 10^18
    }

    function testStalePrice() public {
        // Advance time to ensure we have a meaningful block.timestamp
        vm.warp(block.timestamp + 7200); // Advance by 2 hours

        // Make the price stale by setting old timestamp
        uint256 staleTimestamp = block.timestamp > DEFAULT_STALE_THRESHOLD + 100
            ? block.timestamp - DEFAULT_STALE_THRESHOLD - 100
            : 1;
        xdcAggregator.setStaleTimestamp(staleTimestamp);

        // Should revert due to no valid price (stale feed + no manual price)
        vm.expectRevert("No valid price available");
        oracle.getUnderlyingPrice(PToken(address(pXDC)));
    }

    function testStalePriceWithManualFallback() public {
        // Set manual price first
        vm.prank(admin);
        oracle.setUnderlyingPrice(PToken(address(pXDC)), 60 * 10 ** 16); // $0.60

        // Advance time and make price stale
        vm.warp(block.timestamp + 7200);
        uint256 staleTimestamp = block.timestamp > DEFAULT_STALE_THRESHOLD + 100
            ? block.timestamp - DEFAULT_STALE_THRESHOLD - 100
            : 1;
        xdcAggregator.setStaleTimestamp(staleTimestamp);

        // Unregister the feed to force fallback to manual price
        vm.prank(admin);
        oracle.registerFeed(XDC_TOKEN, address(0));

        // Should return manual price
        uint256 price = oracle.getUnderlyingPrice(PToken(address(pXDC)));
        assertEq(price, 60 * 10 ** 16);
    }

    function testSetManualPrice() public {
        uint256 manualPrice = 75 * 10 ** 16; // $0.75

        vm.prank(admin);
        oracle.setUnderlyingPrice(PToken(address(pXDC)), manualPrice);

        // Unregister the feed to test manual price fallback
        vm.prank(admin);
        oracle.registerFeed(XDC_TOKEN, address(0));

        uint256 price = oracle.getUnderlyingPrice(PToken(address(pXDC)));
        assertEq(price, manualPrice);
    }

    function testAssetStaleThreshold() public {
        uint256 customThreshold = 1800; // 30 minutes

        vm.prank(admin);
        oracle.setAssetStaleThreshold(XDC_TOKEN, customThreshold);

        assertEq(oracle.feedsStaleThreshold(XDC_TOKEN), customThreshold);

        // Advance time and make price stale according to custom threshold
        vm.warp(block.timestamp + 3600); // Advance by 1 hour
        uint256 staleTimestamp = block.timestamp > customThreshold + 100
            ? block.timestamp - customThreshold - 100
            : 1;
        xdcAggregator.setStaleTimestamp(staleTimestamp);

        vm.expectRevert("No valid price available");
        oracle.getUnderlyingPrice(PToken(address(pXDC)));
    }

    function testRegisterExistingFeed() public {
        address newFeedsAccess = address(0x888);

        vm.prank(admin);
        oracle.registerFeed(XDC_TOKEN, newFeedsAccess);

        assertEq(oracle.assetToFeedsAccess(XDC_TOKEN), newFeedsAccess);
    }

    function testRegisterFeedOnlyAdmin() public {
        address newFeedsAccess = address(0x888);

        vm.prank(user);
        vm.expectRevert("Only admin can call this function");
        oracle.registerFeed(XDC_TOKEN, newFeedsAccess);
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
        oracle.setAdmin(user);

        vm.prank(user);
        vm.expectRevert("Only owner can call this function");
        oracle.removeAdmin(admin);

        vm.prank(user);
        vm.expectRevert("Only owner can call this function");
        oracle.setOwner(user);
    }

    function testInvalidAggregatorAddress() public {
        vm.prank(admin);
        vm.expectRevert("Invalid aggregator address");
        oracle.deployAndRegisterFeed(address(0x999), address(0));
    }

    function testNoValidPriceAvailable() public {
        address unregisteredAsset = address(0x999);
        MockPToken unregisteredPToken = new MockPToken(
            "pTEST",
            unregisteredAsset
        );

        vm.expectRevert("No valid price available");
        oracle.getUnderlyingPrice(PToken(address(unregisteredPToken)));
    }

    function testFeedsAccessFunctions() public {
        address feedsAccessAddr = oracle.assetToFeedsAccess(XDC_TOKEN);
        FeedsAccess feedsAccess = FeedsAccess(feedsAccessAddr);

        // Test all FeedsAccess functions
        assertEq(feedsAccess.fetchLatestAnswer(), 50000000); // 0.50 with 8 decimals
        assertEq(feedsAccess.getDecimals(), 8);
        assertEq(feedsAccess.getDescription(), "XDC/USD");

        (
            uint80 roundId,
            uint256 price,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = feedsAccess.fetchLatestRoundData();

        assertEq(price, 50000000);
        assertTrue(updatedAt > 0);
        assertEq(roundId, 1);
    }

    function testDecimalConversion() public {
        // Test with 6-decimal aggregator (like USDC)
        MockPluginAggregator usdcAggregator = new MockPluginAggregator(
            1 * 10 ** 6, // $1.00 with 6 decimals
            6,
            "USDC/USD"
        );

        address usdcToken = address(0x999);
        MockPToken pUSDC = new MockPToken("pUSDC", usdcToken);

        vm.prank(admin);
        oracle.deployAndRegisterFeed(usdcToken, address(usdcAggregator));

        uint256 price = oracle.getUnderlyingPrice(PToken(address(pUSDC)));
        assertEq(price, 1 * 10 ** 18); // Should be converted to 18 decimals
    }

    function testHighDecimalConversion() public {
        // Test with 20-decimal aggregator (hypothetical)
        MockPluginAggregator highDecAggregator = new MockPluginAggregator(
            1000 * 10 ** 20, // $1000 with 20 decimals
            20,
            "HIGH/USD"
        );

        address highToken = address(0x998);
        MockPToken pHIGH = new MockPToken("pHIGH", highToken);

        vm.prank(admin);
        oracle.deployAndRegisterFeed(highToken, address(highDecAggregator));

        uint256 price = oracle.getUnderlyingPrice(PToken(address(pHIGH)));
        assertEq(price, 1000 * 10 ** 18); // Should be converted to 18 decimals
    }

    function testPluginDocumentationPattern() public {
        // This test verifies the exact pattern from Plugin documentation

        // 1. Deploy aggregator (simulates Plugin's deployed aggregator)
        MockPluginAggregator pluginAggregator = new MockPluginAggregator(
            7527 * 10 ** 5, // $0.7527 with 8 decimals (example from docs)
            8,
            "XDC/USDT"
        );

        // 2. Deploy and register using Plugin pattern
        address testAsset = address(0x777);
        vm.prank(admin);
        address feedsAccessAddr = oracle.deployAndRegisterFeed(
            testAsset,
            address(pluginAggregator)
        );

        // 3. Verify FeedsAccess contract works as in Plugin docs
        FeedsAccess feedsAccess = FeedsAccess(feedsAccessAddr);
        uint256 latestAnswer = feedsAccess.fetchLatestAnswer();
        assertEq(latestAnswer, 7527 * 10 ** 5);

        // 4. Verify oracle returns correct 18-decimal price
        MockPToken testPToken = new MockPToken("pTEST", testAsset);
        uint256 price = oracle.getUnderlyingPrice(PToken(address(testPToken)));
        assertEq(price, 7527 * 10 ** 15); // 0.7527 * 10^18
    }

    function testStalePriceDirectCall() public {
        // Get the feeds access address
        address feedsAccessAddr = oracle.assetToFeedsAccess(XDC_TOKEN);

        // Advance time and make price stale
        vm.warp(block.timestamp + 7200); // Advance by 2 hours
        uint256 staleTimestamp = block.timestamp > DEFAULT_STALE_THRESHOLD + 100
            ? block.timestamp - DEFAULT_STALE_THRESHOLD - 100
            : 1;
        xdcAggregator.setStaleTimestamp(staleTimestamp);

        // Should revert with "Price feed is stale" when calling internal function directly
        // We need to call from the oracle contract itself due to the internal function protection
        vm.prank(address(oracle));
        vm.expectRevert("Price feed is stale");
        oracle._getFeedsPrice(feedsAccessAddr, XDC_TOKEN);
    }

    receive() external payable {}
}
