// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC2771Context} from "../libraries/ERC2771Context.sol";
import {GeneratedERC721} from "./GeneratedERC721.sol";

/**
 * @title ERC721Generator
 * @notice Factory for creating customizable ERC721 NFT collections
 * @dev Called via BiuBiuPremium.callTool(), uses ERC2771Context for real sender
 *
 * Features bitmap:
 *   bit 0:  publicMint    - anyone can mint (with payment)
 *   bit 1:  whitelistMint - whitelist mint with Merkle proof
 *   bit 2:  reveal        - blind box mechanism
 *   bit 3:  royalty       - ERC2981 royalty support
 *   bit 4:  pausable      - owner can pause mint/transfer
 *   bit 5:  burnable      - token holders can burn
 *   bit 6:  soulbound     - non-transferable (SBT)
 *   bit 7:  enumerable    - ERC721Enumerable support
 *   bit 8:  updatableURI  - owner can update individual token URIs
 *   bit 9:  revenueSplit  - auto-split mint revenue to multiple addresses
 */
contract ERC721Generator is ERC2771Context {
    // ============ Errors ============

    error InvalidConfig();
    error InvalidSplitShares();

    // ============ Events ============

    /// @notice Emitted when a new collection is created
    event CollectionCreated(
        address indexed collection,
        address indexed owner,
        string name,
        string symbol,
        uint256 maxSupply,
        uint16 features
    );

    // ============ Feature Constants ============

    uint16 public constant FEATURE_PUBLIC_MINT = 1 << 0;
    uint16 public constant FEATURE_WHITELIST_MINT = 1 << 1;
    uint16 public constant FEATURE_REVEAL = 1 << 2;
    uint16 public constant FEATURE_ROYALTY = 1 << 3;
    uint16 public constant FEATURE_PAUSABLE = 1 << 4;
    uint16 public constant FEATURE_BURNABLE = 1 << 5;
    uint16 public constant FEATURE_SOULBOUND = 1 << 6;
    uint16 public constant FEATURE_ENUMERABLE = 1 << 7;
    uint16 public constant FEATURE_UPDATABLE_URI = 1 << 8;
    uint16 public constant FEATURE_REVENUE_SPLIT = 1 << 9;

    // ============ Structs ============

    struct CollectionConfig {
        string name;
        string symbol;
        uint256 maxSupply;
        uint16 features;
        string baseURI;
        string hiddenURI; // for reveal feature
        string contractURI; // collection metadata
        address royaltyReceiver;
        uint96 royaltyBps; // e.g., 500 = 5%
        address[] splitAddresses;
        uint256[] splitShares; // basis points, sum to 10000
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
     * @notice Create a new ERC721 NFT collection
     * @param config Collection configuration
     * @return collection Address of the newly created collection
     */
    function createCollection(CollectionConfig calldata config) external returns (address collection) {
        address sender = _msgSender();

        // Validate
        if (bytes(config.name).length == 0 || bytes(config.symbol).length == 0) {
            revert InvalidConfig();
        }
        if (config.maxSupply == 0) revert InvalidConfig();

        // Validate royalty
        if ((config.features & FEATURE_ROYALTY) != 0) {
            if (config.royaltyReceiver == address(0)) revert InvalidConfig();
            if (config.royaltyBps > 10000) revert InvalidConfig();
        }

        // Validate revenue split
        if ((config.features & FEATURE_REVENUE_SPLIT) != 0) {
            if (config.splitAddresses.length == 0) revert InvalidConfig();
            if (config.splitAddresses.length != config.splitShares.length) revert InvalidConfig();
            uint256 totalShares;
            for (uint256 i; i < config.splitShares.length;) {
                totalShares += config.splitShares[i];
                unchecked {
                    ++i;
                }
            }
            if (totalShares != 10000) revert InvalidSplitShares();
        }

        // Deploy collection
        collection = address(
            new GeneratedERC721(
                config.name,
                config.symbol,
                config.maxSupply,
                sender,
                config.features,
                config.baseURI,
                config.hiddenURI,
                config.contractURI,
                config.royaltyReceiver,
                config.royaltyBps,
                config.splitAddresses,
                config.splitShares
            )
        );

        // Record
        collections.push(collection);
        collectionsByCreator[sender].push(collection);

        emit CollectionCreated(collection, sender, config.name, config.symbol, config.maxSupply, config.features);
    }

    /**
     * @notice Create a simple NFT collection with minimal config
     * @param name Collection name
     * @param symbol Collection symbol
     * @param maxSupply Maximum supply
     * @param baseURI Base URI for metadata
     * @return collection Address of the newly created collection
     */
    function createSimpleCollection(
        string calldata name,
        string calldata symbol,
        uint256 maxSupply,
        string calldata baseURI
    ) external returns (address collection) {
        address sender = _msgSender();

        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidConfig();
        if (maxSupply == 0) revert InvalidConfig();

        // Simple collection with public mint and enumerable
        uint16 features = FEATURE_PUBLIC_MINT | FEATURE_ENUMERABLE;

        collection = address(
            new GeneratedERC721(
                name,
                symbol,
                maxSupply,
                sender,
                features,
                baseURI,
                "", // no hidden URI
                "", // no contract URI
                address(0), // no royalty
                0,
                new address[](0),
                new uint256[](0)
            )
        );

        collections.push(collection);
        collectionsByCreator[sender].push(collection);

        emit CollectionCreated(collection, sender, name, symbol, maxSupply, features);
    }

    /**
     * @notice Create a PFP collection with reveal and royalty
     * @param name Collection name
     * @param symbol Collection symbol
     * @param maxSupply Maximum supply
     * @param hiddenURI URI shown before reveal
     * @param royaltyReceiver Address to receive royalties
     * @param royaltyBps Royalty in basis points (500 = 5%)
     * @return collection Address of the newly created collection
     */
    function createPFPCollection(
        string calldata name,
        string calldata symbol,
        uint256 maxSupply,
        string calldata hiddenURI,
        address royaltyReceiver,
        uint96 royaltyBps
    ) external returns (address collection) {
        address sender = _msgSender();

        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidConfig();
        if (maxSupply == 0) revert InvalidConfig();
        if (royaltyReceiver == address(0)) revert InvalidConfig();
        if (royaltyBps > 10000) revert InvalidConfig();

        // PFP features: public mint, whitelist, reveal, royalty, pausable, enumerable
        uint16 features = FEATURE_PUBLIC_MINT | FEATURE_WHITELIST_MINT | FEATURE_REVEAL | FEATURE_ROYALTY
            | FEATURE_PAUSABLE | FEATURE_ENUMERABLE;

        collection = address(
            new GeneratedERC721(
                name,
                symbol,
                maxSupply,
                sender,
                features,
                "", // baseURI set on reveal
                hiddenURI,
                "",
                royaltyReceiver,
                royaltyBps,
                new address[](0),
                new uint256[](0)
            )
        );

        collections.push(collection);
        collectionsByCreator[sender].push(collection);

        emit CollectionCreated(collection, sender, name, symbol, maxSupply, features);
    }

    /**
     * @notice Create a Soulbound Token (SBT) collection
     * @param name Collection name
     * @param symbol Collection symbol
     * @param maxSupply Maximum supply
     * @param baseURI Base URI for metadata
     * @return collection Address of the newly created collection
     */
    function createSBTCollection(
        string calldata name,
        string calldata symbol,
        uint256 maxSupply,
        string calldata baseURI
    ) external returns (address collection) {
        address sender = _msgSender();

        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidConfig();
        if (maxSupply == 0) revert InvalidConfig();

        // SBT features: soulbound + enumerable + updatable URI
        uint16 features = FEATURE_SOULBOUND | FEATURE_ENUMERABLE | FEATURE_UPDATABLE_URI;

        collection = address(
            new GeneratedERC721(
                name,
                symbol,
                maxSupply,
                sender,
                features,
                baseURI,
                "",
                "",
                address(0),
                0,
                new address[](0),
                new uint256[](0)
            )
        );

        collections.push(collection);
        collectionsByCreator[sender].push(collection);

        emit CollectionCreated(collection, sender, name, symbol, maxSupply, features);
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
