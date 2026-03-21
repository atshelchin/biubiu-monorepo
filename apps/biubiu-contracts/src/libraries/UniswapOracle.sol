// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IUniswapV3Pool} from "../interfaces/IUniswapV3Pool.sol";

/**
 * @title UniswapOracle
 * @notice Decentralized ETH/USD price via Uniswap V3 WETH/USDC pool
 * @dev Uses spot price from slot0(). Fully on-chain, no centralized oracle.
 *      Arbitrum WETH/USDC 0.05% pool (token0=WETH 18dec, token1=USDC 6dec).
 */
library UniswapOracle {
    /// @notice Arbitrum WETH/USDC 0.05% pool
    IUniswapV3Pool internal constant POOL = IUniswapV3Pool(0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443);

    /// @notice Get ETH price in USD (8 decimals)
    /// @dev sqrtPriceX96^2 * 1e20 >> 192
    ///      Derivation: price_raw = sqrtPriceX96^2 / 2^192 (USDC_raw per WETH_raw)
    ///      ETH in USD (8 dec) = price_raw * 10^(18-6) * 10^8 = price_raw * 10^20
    function getEthUsdPrice() internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,,,,) = POOL.slot0();
        uint256 p = uint256(sqrtPriceX96);
        return (p * p * 1e20) >> 192;
    }

    /// @notice Convert USD amount (8 decimals) to ETH (wei)
    function usdToEth(uint256 usdAmount8) internal view returns (uint256) {
        uint256 ethPrice8 = getEthUsdPrice();
        require(ethPrice8 > 0, "UniswapOracle: zero price");
        return usdAmount8 * 1e18 / ethPrice8;
    }
}
