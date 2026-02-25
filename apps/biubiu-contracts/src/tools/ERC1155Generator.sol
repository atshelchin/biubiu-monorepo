// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC2771Context} from "../libraries/ERC2771Context.sol";
import {GeneratedERC1155} from "./GeneratedERC1155.sol";

/**
 * @title ERC1155Generator
 * @notice Factory for creating customizable ERC1155 multi-token collections
 * @dev Called via BiuBiuPremium.callTool(), uses ERC2771Context for real sender
 *
 * Features bitmap:
 *   bit 0:  publicMint        - anyone can mint (with payment)
 *   bit 1:  minterRole        - multiple minter addresses (game servers)
 *   bit 2:  royalty           - ERC2981 royalty support
 *   bit 3:  pausable          - owner can pause transfers
 *   bit 4:  burnable          - token holders can burn
 *   bit 5:  supplyTracking    - track total supply per tokenId
 *   bit 6:  maxSupplyPerToken - each tokenId can have maxSupply limit
 *   bit 7:  updatableURI      - owner can update individual token URIs
 *   bit 8:  dynamicToken      - owner can create new tokenIds at runtime
 *   bit 9:  soulbound         - non-transferable (achievements/badges)
 *
 * Presets:
 *   - Game Collection: minterRole + burnable + dynamicToken + supplyTracking + updatableURI
 *   - Ticket Collection: publicMint + burnable + maxSupplyPerToken + supplyTracking
 *   - Achievement Collection: minterRole + soulbound + supplyTracking + dynamicToken
 *   - Membership Collection: publicMint + minterRole + royalty + supplyTracking + pausable
 */
contract ERC1155Generator is ERC2771Context {
    // ============ Errors ============

    error InvalidConfig();

    // ============ Events ============

    /// @notice Emitted when a new collection is created
    event CollectionCreated(
        address indexed collection, address indexed owner, string name, string symbol, uint16 features
    );

    // ============ Feature Constants ============

    uint16 public constant FEATURE_PUBLIC_MINT = 1 << 0;
    uint16 public constant FEATURE_MINTER_ROLE = 1 << 1;
    uint16 public constant FEATURE_ROYALTY = 1 << 2;
    uint16 public constant FEATURE_PAUSABLE = 1 << 3;
    uint16 public constant FEATURE_BURNABLE = 1 << 4;
    uint16 public constant FEATURE_SUPPLY_TRACKING = 1 << 5;
    uint16 public constant FEATURE_MAX_SUPPLY_PER_TOKEN = 1 << 6;
    uint16 public constant FEATURE_UPDATABLE_URI = 1 << 7;
    uint16 public constant FEATURE_DYNAMIC_TOKEN = 1 << 8;
    uint16 public constant FEATURE_SOULBOUND = 1 << 9;

    // ============ Structs ============

    struct CollectionConfig {
        string name;
        string symbol;
        uint16 features;
        string baseURI;
        string contractURI;
        address royaltyReceiver;
        uint96 royaltyBps;
        uint256[] initialTokenIds;
        uint256[] initialMaxSupplies;
    }

    // ============ Storage ============

    /// @notice All collections created by this factory
    address[] public collections;

    /// @notice Collections created by a specific address
    mapping(address => address[]) public collectionsByCreator;

    // ============ Constructor ============

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    // ============ Create Collection ============

    /**
     * @notice Create a new ERC1155 collection with full configuration
     * @param config Collection configuration
     * @return collection Address of the newly created collection
     */
    function createCollection(CollectionConfig calldata config) external returns (address collection) {
        address sender = _msgSender();

        // Validate
        if (bytes(config.name).length == 0 || bytes(config.symbol).length == 0) {
            revert InvalidConfig();
        }

        // Validate royalty
        if ((config.features & FEATURE_ROYALTY) != 0) {
            if (config.royaltyReceiver == address(0)) revert InvalidConfig();
            if (config.royaltyBps > 10000) revert InvalidConfig();
        }

        // Deploy collection
        collection = address(
            new GeneratedERC1155(
                config.name,
                config.symbol,
                sender,
                config.features,
                config.baseURI,
                config.contractURI,
                config.royaltyReceiver,
                config.royaltyBps,
                config.initialTokenIds,
                config.initialMaxSupplies
            )
        );

        // Record
        collections.push(collection);
        collectionsByCreator[sender].push(collection);

        emit CollectionCreated(collection, sender, config.name, config.symbol, config.features);
    }

    /**
     * @notice Create a game item collection (optimized for game developers)
     * @dev Features: minterRole + burnable + dynamicToken + supplyTracking + updatableURI
     * @param name Collection name
     * @param symbol Collection symbol
     * @param baseURI Base URI for metadata
     * @return collection Address of the newly created collection
     */
    function createGameCollection(string calldata name, string calldata symbol, string calldata baseURI)
        external
        returns (address collection)
    {
        address sender = _msgSender();

        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidConfig();

        // Game features: minterRole + burnable + dynamicToken + supplyTracking + updatableURI
        uint16 features = FEATURE_MINTER_ROLE | FEATURE_BURNABLE | FEATURE_SUPPLY_TRACKING | FEATURE_UPDATABLE_URI
            | FEATURE_DYNAMIC_TOKEN;

        collection = address(
            new GeneratedERC1155(
                name, symbol, sender, features, baseURI, "", address(0), 0, new uint256[](0), new uint256[](0)
            )
        );

        collections.push(collection);
        collectionsByCreator[sender].push(collection);

        emit CollectionCreated(collection, sender, name, symbol, features);
    }

    /**
     * @notice Create a ticket/pass collection
     * @dev Features: publicMint + burnable + maxSupplyPerToken + supplyTracking
     * @param name Collection name
     * @param symbol Collection symbol
     * @param baseURI Base URI for metadata
     * @param tokenIds Initial ticket type IDs
     * @param maxSupplies Max supply for each ticket type
     * @return collection Address of the newly created collection
     */
    function createTicketCollection(
        string calldata name,
        string calldata symbol,
        string calldata baseURI,
        uint256[] calldata tokenIds,
        uint256[] calldata maxSupplies
    ) external returns (address collection) {
        address sender = _msgSender();

        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidConfig();
        if (tokenIds.length != maxSupplies.length) revert InvalidConfig();

        // Ticket features: publicMint + burnable + maxSupplyPerToken + supplyTracking
        uint16 features =
            FEATURE_PUBLIC_MINT | FEATURE_BURNABLE | FEATURE_SUPPLY_TRACKING | FEATURE_MAX_SUPPLY_PER_TOKEN;

        collection = address(
            new GeneratedERC1155(name, symbol, sender, features, baseURI, "", address(0), 0, tokenIds, maxSupplies)
        );

        collections.push(collection);
        collectionsByCreator[sender].push(collection);

        emit CollectionCreated(collection, sender, name, symbol, features);
    }

    /**
     * @notice Create an achievement/badge collection (soulbound)
     * @dev Features: minterRole + soulbound + supplyTracking + dynamicToken
     * @param name Collection name
     * @param symbol Collection symbol
     * @param baseURI Base URI for metadata
     * @return collection Address of the newly created collection
     */
    function createAchievementCollection(string calldata name, string calldata symbol, string calldata baseURI)
        external
        returns (address collection)
    {
        address sender = _msgSender();

        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidConfig();

        // Achievement features: minterRole + soulbound + supplyTracking + dynamicToken
        uint16 features = FEATURE_MINTER_ROLE | FEATURE_SOULBOUND | FEATURE_SUPPLY_TRACKING | FEATURE_DYNAMIC_TOKEN;

        collection = address(
            new GeneratedERC1155(
                name, symbol, sender, features, baseURI, "", address(0), 0, new uint256[](0), new uint256[](0)
            )
        );

        collections.push(collection);
        collectionsByCreator[sender].push(collection);

        emit CollectionCreated(collection, sender, name, symbol, features);
    }

    /**
     * @notice Create a membership card collection with royalty
     * @dev Features: publicMint + minterRole + royalty + supplyTracking + pausable
     * @param name Collection name
     * @param symbol Collection symbol
     * @param baseURI Base URI for metadata
     * @param royaltyReceiver Address to receive royalties
     * @param royaltyBps Royalty in basis points (500 = 5%)
     * @return collection Address of the newly created collection
     */
    function createMembershipCollection(
        string calldata name,
        string calldata symbol,
        string calldata baseURI,
        address royaltyReceiver,
        uint96 royaltyBps
    ) external returns (address collection) {
        address sender = _msgSender();

        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidConfig();
        if (royaltyReceiver == address(0)) revert InvalidConfig();
        if (royaltyBps > 10000) revert InvalidConfig();

        // Membership features: publicMint + minterRole + royalty + supplyTracking + pausable
        uint16 features =
            FEATURE_PUBLIC_MINT | FEATURE_MINTER_ROLE | FEATURE_ROYALTY | FEATURE_SUPPLY_TRACKING | FEATURE_PAUSABLE;

        collection = address(
            new GeneratedERC1155(
                name,
                symbol,
                sender,
                features,
                baseURI,
                "",
                royaltyReceiver,
                royaltyBps,
                new uint256[](0),
                new uint256[](0)
            )
        );

        collections.push(collection);
        collectionsByCreator[sender].push(collection);

        emit CollectionCreated(collection, sender, name, symbol, features);
    }

    // ============ View Functions ============

    /// @notice Get total number of collections created
    function totalCollections() external view returns (uint256) {
        return collections.length;
    }

    /// @notice Get collections created by a specific address
    function getCollectionsByCreator(address creator) external view returns (address[] memory) {
        return collectionsByCreator[creator];
    }

    /// @notice Get collections created by a specific address (paginated)
    function getCollectionsByCreatorPaginated(address creator, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory result)
    {
        address[] storage creatorCollections = collectionsByCreator[creator];
        uint256 len = creatorCollections.length;

        if (offset >= len) return new address[](0);

        uint256 end = offset + limit;
        if (end > len) end = len;

        result = new address[](end - offset);
        for (uint256 i = offset; i < end;) {
            result[i - offset] = creatorCollections[i];
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Get all collections (paginated)
    function getCollectionsPaginated(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        uint256 len = collections.length;

        if (offset >= len) return new address[](0);

        uint256 end = offset + limit;
        if (end > len) end = len;

        result = new address[](end - offset);
        for (uint256 i = offset; i < end;) {
            result[i - offset] = collections[i];
            unchecked {
                ++i;
            }
        }
    }
}
