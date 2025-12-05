// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SimpleYieldVault
 * @notice A simple ERC4626 vault for USDC deposits on Avalanche Fuji
 * @dev This is a demonstration vault for the Vox402 hackathon project
 *      It accepts USDC deposits and issues vault shares
 *      For demo purposes, yield is simulated - in production would integrate with a real protocol
 */
contract SimpleYieldVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    // Simulated APY in basis points (850 = 8.5%)
    uint256 public constant APY_BPS = 850;
    
    // Track deposits for yield calculation
    mapping(address => uint256) public depositTimestamps;
    mapping(address => uint256) public lastClaimTimestamp;

    event Deposited(address indexed user, uint256 assets, uint256 shares);
    event Withdrawn(address indexed user, uint256 assets, uint256 shares);

    constructor(
        IERC20 _asset,
        string memory _name,
        string memory _symbol
    ) ERC4626(_asset) ERC20(_name, _symbol) Ownable(msg.sender) {}

    /**
     * @notice Deposit assets and receive shares
     * @param assets Amount of USDC to deposit
     * @param receiver Address to receive the shares
     * @return shares Amount of vault shares minted
     */
    function deposit(uint256 assets, address receiver) public override returns (uint256 shares) {
        shares = super.deposit(assets, receiver);
        
        if (depositTimestamps[receiver] == 0) {
            depositTimestamps[receiver] = block.timestamp;
        }
        lastClaimTimestamp[receiver] = block.timestamp;
        
        emit Deposited(receiver, assets, shares);
        return shares;
    }

    /**
     * @notice Withdraw assets by burning shares
     * @param assets Amount of USDC to withdraw
     * @param receiver Address to receive the USDC
     * @param owner Owner of the shares being burned
     * @return shares Amount of shares burned
     */
    function withdraw(uint256 assets, address receiver, address owner) public override returns (uint256 shares) {
        shares = super.withdraw(assets, receiver, owner);
        emit Withdrawn(owner, assets, shares);
        return shares;
    }

    /**
     * @notice Get the simulated pending yield for a user
     * @param user Address of the user
     * @return pendingYield Simulated yield based on time and APY
     */
    function getPendingYield(address user) public view returns (uint256 pendingYield) {
        uint256 balance = balanceOf(user);
        if (balance == 0 || lastClaimTimestamp[user] == 0) return 0;
        
        uint256 timeElapsed = block.timestamp - lastClaimTimestamp[user];
        // yield = balance * APY * timeElapsed / (365 days * 10000)
        pendingYield = (balance * APY_BPS * timeElapsed) / (365 days * 10000);
        return pendingYield;
    }

    /**
     * @notice Get user's vault position info
     * @param user Address of the user
     * @return shares User's share balance
     * @return assets Equivalent asset value
     * @return depositTime When user first deposited
     * @return pendingYield Simulated pending yield
     */
    function getUserPosition(address user) external view returns (
        uint256 shares,
        uint256 assets,
        uint256 depositTime,
        uint256 pendingYield
    ) {
        shares = balanceOf(user);
        assets = convertToAssets(shares);
        depositTime = depositTimestamps[user];
        pendingYield = getPendingYield(user);
    }

    /**
     * @notice Get vault stats
     * @return totalAssets_ Total assets in vault
     * @return totalSupply_ Total shares outstanding  
     * @return apy Annual percentage yield in basis points
     */
    function getVaultStats() external view returns (
        uint256 totalAssets_,
        uint256 totalSupply_,
        uint256 apy
    ) {
        totalAssets_ = totalAssets();
        totalSupply_ = totalSupply();
        apy = APY_BPS;
    }
}
