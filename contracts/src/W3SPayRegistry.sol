// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IW3SPayRegistry.sol";

/**
 * @title W3SPayRegistry
 * @notice Admin-managed on-chain `(merchantId, terminalId) → destinationAccountId`
 *         directory consumed by W3SPay products at boot.
 * @dev See IW3SPayRegistry for the rationale. Three-tier role model:
 *        - `owner`                 transfers ownership; is implicitly a
 *                                  super admin and admin.
 *        - `superAdmins[address]`  grant/revoke admins and super admins.
 *        - `admins[address]`       can write merchant rows.
 *      Every super admin is also an admin, and the owner is always both
 *      (constructor and `transferOwnership` seed all mappings; neither
 *      `removeAdmin` nor `removeSuperAdmin` can demote the owner).
 *
 *      `version` is bumped on every mutation so the off-chain cache can
 *      short-circuit a full re-read when nothing changed.
 */
contract W3SPayRegistry is IW3SPayRegistry {
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

    /// @notice Processor-config CID directory: groupId → record.
    mapping(string => ProcessorConfigRecord) private processorConfigs;
    /// @notice Enumeration of every known processor-config groupId.
    string[] private allProcessorConfigIds;
    /// @notice 1-based position of each groupId in `allProcessorConfigIds` (0 = absent). O(1) swap-and-pop.
    mapping(string => uint256) private processorConfigIdIndex;

    /// @notice Merchant profiles: groupId → profile.
    mapping(string => MerchantProfile) private merchantProfiles;
    /// @notice Enumeration of every known merchant-profile groupId.
    string[] private allMerchantProfileIds;
    /// @notice 1-based position of each groupId in `allMerchantProfileIds` (0 = absent). O(1) swap-and-pop.
    mapping(string => uint256) private merchantProfileIdIndex;

    /// @notice Processor reports: keccak256(groupId|seq) → record. Immutable, append-only.
    mapping(bytes32 => ProcessorReportRecord) private processorReports;
    /// @notice Enumeration of report seqs per groupId.
    mapping(string => uint64[]) private processorReportSeqs;

    address public owner;
    mapping(address => bool) private admins;
    mapping(address => bool) private superAdmins;

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

    modifier onlySuperAdmin() {
        require(superAdmins[msg.sender], "Not super admin");
        _;
    }

    // ========== CONSTRUCTOR ==========

    constructor() {
        owner = msg.sender;
        admins[msg.sender] = true;
        superAdmins[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit AdminAdded(msg.sender);
        emit SuperAdminAdded(msg.sender);
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

    // ========== PROCESSOR CONFIGS ==========

    function upsertProcessorConfig(
        string calldata groupId,
        string calldata cid,
        uint32 size
    ) external override onlyAdmin {
        require(bytes(groupId).length > 0, "Empty groupId");
        require(bytes(cid).length > 0, "Empty cid");
        require(size > 0, "Zero size");

        ProcessorConfigRecord storage record = processorConfigs[groupId];
        if (!record.exists) {
            record.groupId = groupId;
            allProcessorConfigIds.push(groupId);
            processorConfigIdIndex[groupId] = allProcessorConfigIds.length; // 1-based
            record.exists = true;
        }
        record.cid = cid;
        record.size = size;
        record.updatedAt = uint64(block.timestamp);

        unchecked { version += 1; }

        emit ProcessorConfigUpserted(groupId, cid, size);
    }

    function removeProcessorConfig(string calldata groupId) external override onlyAdmin {
        ProcessorConfigRecord storage record = processorConfigs[groupId];
        require(record.exists, "Unknown processorConfig");

        _removeProcessorConfigIdFromEnumeration(groupId);
        delete processorConfigs[groupId];

        unchecked { version += 1; }

        emit ProcessorConfigRemoved(groupId);
    }

    // ========== MERCHANT PROFILES ==========

    function upsertMerchantProfile(
        string calldata groupId,
        string calldata merchantName,
        string calldata merchantId,
        string calldata addressLine1,
        string calldata addressLine2,
        string calldata phone,
        string calldata taxId
    ) external override onlyAdmin {
        require(bytes(groupId).length > 0, "Empty groupId");
        require(bytes(merchantName).length > 0, "Empty merchantName");
        require(bytes(merchantId).length > 0, "Empty merchantId");

        MerchantProfile storage profile = merchantProfiles[groupId];
        if (!profile.exists) {
            profile.groupId = groupId;
            allMerchantProfileIds.push(groupId);
            merchantProfileIdIndex[groupId] = allMerchantProfileIds.length; // 1-based
            profile.exists = true;
        }
        profile.merchantName = merchantName;
        profile.merchantId = merchantId;
        profile.addressLine1 = addressLine1;
        profile.addressLine2 = addressLine2;
        profile.phone = phone;
        profile.taxId = taxId;
        profile.updatedAt = uint64(block.timestamp);

        unchecked { version += 1; }

        emit MerchantProfileUpserted(groupId, merchantName, merchantId);
    }

    function removeMerchantProfile(string calldata groupId) external override onlyAdmin {
        MerchantProfile storage profile = merchantProfiles[groupId];
        require(profile.exists, "Unknown merchantProfile");

        _removeMerchantProfileIdFromEnumeration(groupId);
        delete merchantProfiles[groupId];

        unchecked { version += 1; }

        emit MerchantProfileRemoved(groupId);
    }

    // ========== PROCESSOR REPORTS (permissionless) ==========

    function addProcessorReport(
        string calldata groupId,
        uint64 seq,
        string calldata cid,
        uint32 size
    ) external override {
        require(bytes(groupId).length > 0, "Empty groupId");
        require(bytes(cid).length > 0, "Empty cid");
        require(size > 0, "Zero size");

        bytes32 key = _reportKey(groupId, seq);
        ProcessorReportRecord storage rec = processorReports[key];
        if (rec.exists) {
            // Idempotent retry only: same cid+size succeeds (no event); a
            // different cid is rejected (records are immutable, first-writer-wins).
            require(
                keccak256(bytes(rec.cid)) == keccak256(bytes(cid)) && rec.size == size,
                "Report exists"
            );
            return;
        }

        processorReports[key] = ProcessorReportRecord({
            seq: seq,
            cid: cid,
            size: size,
            committedAt: uint64(block.timestamp),
            exists: true
        });
        processorReportSeqs[groupId].push(seq);

        unchecked { version += 1; }

        emit ProcessorReportAdded(groupId, seq, cid, size, msg.sender);
    }

    // ========== ADMIN ==========

    function addAdmin(address admin) external override onlySuperAdmin {
        require(admin != address(0), "Zero admin");
        require(!admins[admin], "Already admin");
        admins[admin] = true;
        emit AdminAdded(admin);
    }

    function bulkAddAdmins(address[] calldata newAdmins) external override onlySuperAdmin {
        for (uint256 i = 0; i < newAdmins.length; i++) {
            address a = newAdmins[i];
            require(a != address(0), "Zero admin");
            if (!admins[a]) {
                admins[a] = true;
                emit AdminAdded(a);
            }
        }
    }

    function removeAdmin(address admin) external override onlySuperAdmin {
        require(admin != owner, "Cannot demote owner");
        require(!superAdmins[admin], "Demote super admin first");
        require(admins[admin], "Not admin");
        admins[admin] = false;
        emit AdminRemoved(admin);
    }

    function addSuperAdmin(address account) external override onlySuperAdmin {
        require(account != address(0), "Zero super admin");
        require(!superAdmins[account], "Already super admin");
        superAdmins[account] = true;
        // Every super admin is an admin: seed the row-write role too.
        if (!admins[account]) {
            admins[account] = true;
            emit AdminAdded(account);
        }
        emit SuperAdminAdded(account);
    }

    function removeSuperAdmin(address account) external override onlySuperAdmin {
        require(account != owner, "Cannot demote owner");
        require(superAdmins[account], "Not super admin");
        // Demotes to normal admin; call removeAdmin afterwards to revoke fully.
        superAdmins[account] = false;
        emit SuperAdminRemoved(account);
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
        if (!superAdmins[newOwner]) {
            superAdmins[newOwner] = true;
            emit SuperAdminAdded(newOwner);
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

    function isSuperAdmin(address who) external view override returns (bool) {
        return superAdmins[who];
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

    function getProcessorConfig(string calldata groupId)
        external
        view
        override
        returns (ProcessorConfigRecord memory)
    {
        return processorConfigs[groupId];
    }

    function getAllProcessorConfigIds() external view override returns (string[] memory) {
        return allProcessorConfigIds;
    }

    function getProcessorConfigCount() external view override returns (uint256) {
        return allProcessorConfigIds.length;
    }

    function getMerchantProfile(string calldata groupId)
        external
        view
        override
        returns (MerchantProfile memory)
    {
        return merchantProfiles[groupId];
    }

    function getAllMerchantProfileIds() external view override returns (string[] memory) {
        return allMerchantProfileIds;
    }

    function getMerchantProfileCount() external view override returns (uint256) {
        return allMerchantProfileIds.length;
    }

    function getProcessorReport(string calldata groupId, uint64 seq)
        external
        view
        override
        returns (ProcessorReportRecord memory)
    {
        return processorReports[_reportKey(groupId, seq)];
    }

    function getProcessorReportSeqs(string calldata groupId)
        external
        view
        override
        returns (uint64[] memory)
    {
        return processorReportSeqs[groupId];
    }

    function getProcessorReportCount(string calldata groupId) external view override returns (uint256) {
        return processorReportSeqs[groupId].length;
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

    function _reportKey(string memory g, uint64 s) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(g, "|", s));
    }

    function _removeProcessorConfigIdFromEnumeration(string memory groupId) private {
        uint256 position = processorConfigIdIndex[groupId]; // 1-based
        require(position != 0, "GroupId not enumerated");
        uint256 lastIndex = allProcessorConfigIds.length - 1;
        uint256 targetIndex = position - 1;
        if (targetIndex != lastIndex) {
            string memory lastId = allProcessorConfigIds[lastIndex];
            allProcessorConfigIds[targetIndex] = lastId;
            processorConfigIdIndex[lastId] = position;
        }
        allProcessorConfigIds.pop();
        delete processorConfigIdIndex[groupId];
    }

    function _removeMerchantProfileIdFromEnumeration(string memory groupId) private {
        uint256 position = merchantProfileIdIndex[groupId]; // 1-based
        require(position != 0, "GroupId not enumerated");
        uint256 lastIndex = allMerchantProfileIds.length - 1;
        uint256 targetIndex = position - 1;
        if (targetIndex != lastIndex) {
            string memory lastId = allMerchantProfileIds[lastIndex];
            allMerchantProfileIds[targetIndex] = lastId;
            merchantProfileIdIndex[lastId] = position;
        }
        allMerchantProfileIds.pop();
        delete merchantProfileIdIndex[groupId];
    }
}
