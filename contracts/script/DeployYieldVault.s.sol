// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SimpleYieldVault.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DeployYieldVault is Script {
    // Circle USDC on Avalanche Fuji
    address constant USDC = 0x5425890298aed601595a70AB815c96711a31Bc65;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);

        SimpleYieldVault vault = new SimpleYieldVault(
            IERC20(USDC),
            "Vox402 USDC Yield Vault",
            "voxUSDC"
        );

        console.log("=== Vault Deployed ===");
        console.log("Vault Address:", address(vault));
        console.log("Underlying Asset (USDC):", USDC);
        console.log("Vault Name:", vault.name());
        console.log("Vault Symbol:", vault.symbol());

        vm.stopBroadcast();
    }
}
