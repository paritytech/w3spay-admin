// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IW3SPayMerchantRegistry
 * @notice Admin-managed on-chain `(merchantId, terminalId) → destinationAccountId`
 *         directory consumed by W3SPay products at boot.
 * @dev Storage key is `terminalKey = keccak256(abi.encodePacked(merchantId, "|", terminalId))`.
 *      Identity is durable. The TSE serial number ("kassenSerial") is the
 *      receipt-format identifier and lives in the bundled cashier metadata —
 *      NOT on-chain. Rotating a TSE is a metadata edit, not a registry write.
 *
 *      Merchant payout destinations are canonical AccountId32 bytes. Clients
 *      may accept SS58, raw AccountId32 hex, or revive H160 input, but must
 *      normalize to bytes32 before calling this contract. Admin role checks
 *      remain Solidity `address` semantics because `msg.sender` and
 *      `admins[address]` are H160 values under pallet-revive.
 */
interface IW3SPayMerchantRegistry {
    // ========== TYPES ==========

    enum MerchantStatus {
        Active,
        Paused,
        Revoked
    }

    struct MerchantEntry {
        string merchantId;
        string terminalId;
        bytes32 destinationAccountId;
        string displayName;
        MerchantStatus status;
        uint64 addedAt;    // Unix seconds, captured from block.timestamp at register-time.
        uint64 updatedAt;  // Unix seconds, bumped on every mutation.
        bool exists;       // Sentinel so callers can detect the "row missing" case.
    }

    /// @notice CID record for an item-config payload published on Bulletin Chain.
    /// The payload's blake2b-256 CID is the only on-chain identity; renewal,
    /// when ever needed, is the responsibility of whichever account holds the
    /// Bulletin Chain authorization (the host in the host-delegated publish
    /// path) and is not tracked here.
    struct ItemConfigRecord {
        string configId;
        string cid;
        uint32 size;
        uint64 updatedAt;
        bool exists;
    }

    // ========== EVENTS ==========

    event MerchantRegistered(
        bytes32 indexed terminalKey,
        string merchantId,
        string terminalId,
        bytes32 destinationAccountId
    );

    event MerchantUpdated(
        bytes32 indexed terminalKey,
        bytes32 destinationAccountId,
        string displayName
    );

    /**
     * @notice Emitted when an admin rotates only the payout destination,
     *         leaving `displayName` and lifecycle status untouched.
     *         Distinct from `MerchantUpdated` so off-chain subscribers can
     *         react to address rotations specifically — auditing where the
     *         money was redirected is a different concern from "the
     *         display label changed".
     */
    event MerchantDestinationChanged(
        bytes32 indexed terminalKey,
        bytes32 previousDestination,
        bytes32 newDestination
    );

    event MerchantStatusChanged(
        bytes32 indexed terminalKey,
        MerchantStatus previousStatus,
        MerchantStatus newStatus
    );

    event MerchantRemoved(
        bytes32 indexed terminalKey,
        string merchantId,
        string terminalId
    );

    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    event ItemConfigUpserted(
        string configId,
        string cid,
        uint32 size
    );

    event ItemConfigRemoved(string configId);

    // ========== WRITES (onlyAdmin) ==========

    function registerMerchant(
        string calldata merchantId,
        string calldata terminalId,
        bytes32 destinationAccountId,
        string calldata displayName
    ) external;

    function updateMerchant(
        string calldata merchantId,
        string calldata terminalId,
        bytes32 destinationAccountId,
        string calldata displayName
    ) external;

    /**
     * @notice Rotate the payout destination for an existing merchant
     *         without touching `displayName` or lifecycle status.
     *         Reverts when `destinationAccountId` is zero, the row does
     *         not exist, or the new destination equals the current one
     *         (the no-op write would still bump `version` and emit an
     *         event, which we'd rather not do).
     */
    function setMerchantDestination(
        string calldata merchantId,
        string calldata terminalId,
        bytes32 destinationAccountId
    ) external;

    function setMerchantStatus(
        string calldata merchantId,
        string calldata terminalId,
        MerchantStatus status
    ) external;

    function removeMerchant(
        string calldata merchantId,
        string calldata terminalId
    ) external;

    function upsertItemConfig(
        string calldata configId,
        string calldata cid,
        uint32 size
    ) external;

    function removeItemConfig(string calldata configId) external;

    // ========== ADMIN (onlyOwner) ==========

    function addAdmin(address admin) external;
    function removeAdmin(address admin) external;
    function transferOwnership(address newOwner) external;

    // ========== VIEWS ==========

    function getMerchantByKey(bytes32 key) external view returns (MerchantEntry memory);
    function getMerchant(string calldata merchantId, string calldata terminalId) external view returns (MerchantEntry memory);
    function getAllTerminalKeys() external view returns (bytes32[] memory);
    function getMerchantCount() external view returns (uint256);
    function getVersion() external view returns (uint64);
    function terminalKey(string calldata merchantId, string calldata terminalId) external pure returns (bytes32);
    function isAdmin(address who) external view returns (bool);

    function getItemConfig(string calldata configId) external view returns (ItemConfigRecord memory);
    function getAllItemConfigIds() external view returns (string[] memory);
    function getItemConfigCount() external view returns (uint256);
}
