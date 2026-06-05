// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IW3SPayMerchantRegistry.sol";

/**
 * @title W3SPayMerchantRegistry
 * @notice Admin-managed on-chain `(merchantId, terminalId) → destinationAccountId`
 *         directory consumed by W3SPay products at boot.
 * @dev See IW3SPayMerchantRegistry for the rationale. Admin model mirrors
 *      `T3rminalTransactionLog`:
 *        - `owner`              transfers ownership, grants/revokes admin.
 *        - `admins[address]`    can write merchant rows.
 *      `owner` is implicitly an admin (constructor seeds the mapping).
 *
 *      `version` is bumped on every mutation so the off-chain cache can
 *      short-circuit a full re-read when nothing changed.
 */
contract W3SPayMerchantRegistry is IW3SPayMerchantRegistry {
    // ========== STATE ==========

    /// @notice Directory: terminalKey → row.
    mapping(bytes32 => MerchantEntry) private entries;

    /// @notice Enumeration: all known terminal keys.
    bytes32[] private allTerminalKeys;
    /// @notice 1-based position of each terminalKey in `allTerminalKeys` (0 = absent). Enables O(1) swap-and-pop.
    mapping(bytes32 => uint256) private terminalKeyIndex;

    /// @notice Item-config CID directory: configId → record.
    mapping(string => ItemConfigRecord) private itemConfigs;
    /// @notice Enumeration of every known item-config id.
    string[] private allItemConfigIds;
    /// @notice 1-based position of each configId in `allItemConfigIds` (0 = absent). O(1) swap-and-pop.
    mapping(string => uint256) private itemConfigIdIndex;

    address public owner;
    mapping(address => bool) private admins;

    /// @notice Monotonic counter bumped on every mutation. Lets clients short-circuit reads.
    uint64 public version;

    // ========== MODIFIERS ==========

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAdmin() {
        require(admins[msg.sender], "Not admin");
        _;
    }

    // ========== CONSTRUCTOR ==========

    constructor() {
        owner = msg.sender;
        admins[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit AdminAdded(msg.sender);
    }

    // ========== WRITES ==========

    function registerMerchant(
        string calldata merchantId,
        string calldata terminalId,
        bytes32 destinationAccountId,
        string calldata displayName
    ) external override onlyAdmin {
        require(bytes(merchantId).length > 0, "Empty merchantId");
        require(bytes(terminalId).length > 0, "Empty terminalId");
        require(destinationAccountId != bytes32(0), "Zero destination");

        bytes32 key = _terminalKey(merchantId, terminalId);
        require(!entries[key].exists, "Merchant exists");

        uint64 nowSecs = uint64(block.timestamp);
        entries[key] = MerchantEntry({
            merchantId: merchantId,
            terminalId: terminalId,
            destinationAccountId: destinationAccountId,
            displayName: displayName,
            status: MerchantStatus.Active,
            addedAt: nowSecs,
            updatedAt: nowSecs,
            exists: true
        });

        allTerminalKeys.push(key);
        terminalKeyIndex[key] = allTerminalKeys.length; // 1-based

        unchecked { version += 1; }

        emit MerchantRegistered(key, merchantId, terminalId, destinationAccountId);
    }

    function updateMerchant(
        string calldata merchantId,
        string calldata terminalId,
        bytes32 destinationAccountId,
        string calldata displayName
    ) external override onlyAdmin {
        require(destinationAccountId != bytes32(0), "Zero destination");

        bytes32 key = _terminalKey(merchantId, terminalId);
        MerchantEntry storage entry = entries[key];
        require(entry.exists, "Unknown merchant");

        entry.destinationAccountId = destinationAccountId;
        entry.displayName = displayName;
        entry.updatedAt = uint64(block.timestamp);

        unchecked { version += 1; }

        emit MerchantUpdated(key, destinationAccountId, displayName);
    }

    /**
     * @notice Rotate only the payout destination. Cheaper, narrower, and
     *         audit-friendlier than `updateMerchant`: the event payload
     *         carries both the previous and the new destination so an
     *         off-chain index can render "address rotated from A to B"
     *         without re-reading the row, and `displayName` is guaranteed
     *         untouched (no race against a concurrent rename).
     */
    function setMerchantDestination(
        string calldata merchantId,
        string calldata terminalId,
        bytes32 destinationAccountId
    ) external override onlyAdmin {
        require(destinationAccountId != bytes32(0), "Zero destination");

        bytes32 key = _terminalKey(merchantId, terminalId);
        MerchantEntry storage entry = entries[key];
        require(entry.exists, "Unknown merchant");
        require(entry.destinationAccountId != destinationAccountId, "Destination unchanged");

        bytes32 previousDestination = entry.destinationAccountId;
        entry.destinationAccountId = destinationAccountId;
        entry.updatedAt = uint64(block.timestamp);

        unchecked { version += 1; }

        emit MerchantDestinationChanged(key, previousDestination, destinationAccountId);
    }

    function setMerchantStatus(
        string calldata merchantId,
        string calldata terminalId,
        MerchantStatus status
    ) external override onlyAdmin {
        bytes32 key = _terminalKey(merchantId, terminalId);
        MerchantEntry storage entry = entries[key];
        require(entry.exists, "Unknown merchant");
        require(entry.status != status, "Status unchanged");

        MerchantStatus previousStatus = entry.status;
        entry.status = status;
        entry.updatedAt = uint64(block.timestamp);

        unchecked { version += 1; }

        emit MerchantStatusChanged(key, previousStatus, status);
    }

    function removeMerchant(
        string calldata merchantId,
        string calldata terminalId
    ) external override onlyAdmin {
        bytes32 key = _terminalKey(merchantId, terminalId);
        MerchantEntry storage entry = entries[key];
        require(entry.exists, "Unknown merchant");

        _removeTerminalKeyFromEnumeration(key);
        delete entries[key];

        unchecked { version += 1; }

        emit MerchantRemoved(key, merchantId, terminalId);
    }

    // ========== ITEM CONFIGS ==========

    function upsertItemConfig(
        string calldata configId,
        string calldata cid,
        uint32 size
    ) external override onlyAdmin {
        require(bytes(configId).length > 0, "Empty configId");
        require(bytes(cid).length > 0, "Empty cid");
        require(size > 0, "Zero size");

        ItemConfigRecord storage record = itemConfigs[configId];
        if (!record.exists) {
            record.configId = configId;
            allItemConfigIds.push(configId);
            itemConfigIdIndex[configId] = allItemConfigIds.length; // 1-based
            record.exists = true;
        }
        record.cid = cid;
        record.size = size;
        record.updatedAt = uint64(block.timestamp);

        unchecked { version += 1; }

        emit ItemConfigUpserted(configId, cid, size);
    }

    function removeItemConfig(string calldata configId) external override onlyAdmin {
        ItemConfigRecord storage record = itemConfigs[configId];
        require(record.exists, "Unknown itemConfig");

        _removeItemConfigIdFromEnumeration(configId);
        delete itemConfigs[configId];

        unchecked { version += 1; }

        emit ItemConfigRemoved(configId);
    }

    // ========== ADMIN ==========

    function addAdmin(address admin) external override onlyOwner {
        require(admin != address(0), "Zero admin");
        require(!admins[admin], "Already admin");
        admins[admin] = true;
        emit AdminAdded(admin);
    }

    function removeAdmin(address admin) external override onlyOwner {
        require(admin != owner, "Cannot demote owner");
        require(admins[admin], "Not admin");
        admins[admin] = false;
        emit AdminRemoved(admin);
    }

    function transferOwnership(address newOwner) external override onlyOwner {
        require(newOwner != address(0), "Zero owner");
        address previous = owner;
        owner = newOwner;
        // The new owner is implicitly an admin so the role split keeps working
        // even if the previous owner removes themselves later.
        if (!admins[newOwner]) {
            admins[newOwner] = true;
            emit AdminAdded(newOwner);
        }
        emit OwnershipTransferred(previous, newOwner);
    }

    // ========== VIEWS ==========

    function getMerchantByKey(bytes32 key)
        external
        view
        override
        returns (MerchantEntry memory)
    {
        return entries[key];
    }

    function getMerchant(string calldata merchantId, string calldata terminalId)
        external
        view
        override
        returns (MerchantEntry memory)
    {
        return entries[_terminalKey(merchantId, terminalId)];
    }

    function getAllTerminalKeys() external view override returns (bytes32[] memory) {
        return allTerminalKeys;
    }

    function getMerchantCount() external view override returns (uint256) {
        return allTerminalKeys.length;
    }

    function getVersion() external view override returns (uint64) {
        return version;
    }

    function terminalKey(string calldata merchantId, string calldata terminalId)
        external
        pure
        override
        returns (bytes32)
    {
        return _terminalKey(merchantId, terminalId);
    }

    function isAdmin(address who) external view override returns (bool) {
        return admins[who];
    }

    function getItemConfig(string calldata configId)
        external
        view
        override
        returns (ItemConfigRecord memory)
    {
        return itemConfigs[configId];
    }

    function getAllItemConfigIds() external view override returns (string[] memory) {
        return allItemConfigIds;
    }

    function getItemConfigCount() external view override returns (uint256) {
        return allItemConfigIds.length;
    }

    // ========== INTERNAL ==========

    function _terminalKey(string memory merchantId, string memory terminalId)
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(merchantId, "|", terminalId));
    }

    function _removeTerminalKeyFromEnumeration(bytes32 key) private {
        uint256 position = terminalKeyIndex[key]; // 1-based
        require(position != 0, "Key not enumerated");
        uint256 lastIndex = allTerminalKeys.length - 1;
        uint256 targetIndex = position - 1;
        if (targetIndex != lastIndex) {
            bytes32 lastKey = allTerminalKeys[lastIndex];
            allTerminalKeys[targetIndex] = lastKey;
            terminalKeyIndex[lastKey] = position;
        }
        allTerminalKeys.pop();
        delete terminalKeyIndex[key];
    }

    function _removeItemConfigIdFromEnumeration(string memory configId) private {
        uint256 position = itemConfigIdIndex[configId]; // 1-based
        require(position != 0, "ConfigId not enumerated");
        uint256 lastIndex = allItemConfigIds.length - 1;
        uint256 targetIndex = position - 1;
        if (targetIndex != lastIndex) {
            string memory lastId = allItemConfigIds[lastIndex];
            allItemConfigIds[targetIndex] = lastId;
            itemConfigIdIndex[lastId] = position;
        }
        allItemConfigIds.pop();
        delete itemConfigIdIndex[configId];
    }
}
