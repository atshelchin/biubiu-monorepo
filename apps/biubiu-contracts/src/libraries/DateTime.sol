// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Strings} from "./Strings.sol";

/**
 * @title DateTime
 * @notice Library for timestamp to date conversion and formatting
 * @dev Uses the algorithm from https://howardhinnant.github.io/date_algorithms.html
 */
library DateTime {
    /// @notice Convert Unix timestamp to (year, month, day)
    /// @param timestamp Unix timestamp in seconds
    /// @return year The year (e.g., 2024)
    /// @return month The month (1-12)
    /// @return day The day of month (1-31)
    function toDate(uint256 timestamp) internal pure returns (uint256 year, uint256 month, uint256 day) {
        uint256 z = timestamp / 86400 + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        year = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        day = doy - (153 * mp + 2) / 5 + 1;
        month = mp < 10 ? mp + 3 : mp - 9;
        if (month <= 2) year += 1;
    }

    /// @notice Format timestamp as "YYYY.MM.DD" string
    /// @param timestamp Unix timestamp in seconds
    /// @return Formatted date string
    function formatDate(uint256 timestamp) internal pure returns (string memory) {
        (uint256 y, uint256 m, uint256 d) = toDate(timestamp);
        return string(
            abi.encodePacked(
                Strings.toString(y),
                ".",
                m < 10 ? "0" : "",
                Strings.toString(m),
                ".",
                d < 10 ? "0" : "",
                Strings.toString(d)
            )
        );
    }

    /// @notice Format timestamp as "YYYY-MM-DD" string (ISO 8601)
    /// @param timestamp Unix timestamp in seconds
    /// @return Formatted date string
    function formatDateISO(uint256 timestamp) internal pure returns (string memory) {
        (uint256 y, uint256 m, uint256 d) = toDate(timestamp);
        return string(
            abi.encodePacked(
                Strings.toString(y),
                "-",
                m < 10 ? "0" : "",
                Strings.toString(m),
                "-",
                d < 10 ? "0" : "",
                Strings.toString(d)
            )
        );
    }
}
