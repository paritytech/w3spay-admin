import { expect } from "chai";
import { ethers } from "hardhat";
import { W3SPayRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const DEST_ALPHA_H160 = ethers.getAddress("0x1234567890abcdef1234567890abcdef12345678");
const DEST_BETA_H160 = ethers.getAddress("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
const DEST_GAMMA_H160 = ethers.getAddress("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

const DEST_ALPHA = ethers.zeroPadValue(DEST_ALPHA_H160, 32);
const DEST_BETA = ethers.zeroPadValue(DEST_BETA_H160, 32);
const DEST_GAMMA = ethers.zeroPadValue(DEST_GAMMA_H160, 32);

const STATUS_ACTIVE = 0n;
const STATUS_PAUSED = 1n;
const STATUS_REVOKED = 2n;

function expectedKey(merchantId: string, terminalId: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(["string", "string", "string"], [merchantId, "|", terminalId])
  );
}

describe("W3SPayRegistry", function () {
  let registry: W3SPayRegistry;
  let owner: HardhatEthersSigner;
  let admin: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, admin, outsider] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("W3SPayRegistry");
    registry = (await Registry.deploy()) as unknown as W3SPayRegistry;
    await registry.waitForDeployment();
  });

  describe("Deployment", function () {
    it("seeds owner and owner as admin", async function () {
      expect(await registry.owner()).to.equal(owner.address);
      expect(await registry.isAdmin(owner.address)).to.be.true;
      expect(await registry.isSuperAdmin(owner.address)).to.be.true;
      expect(await registry.getVersion()).to.equal(0);
      expect(await registry.getMerchantCount()).to.equal(0);
    });
  });

  describe("Admin gating", function () {
    it("rejects writes from non-admins", async function () {
      await expect(
        registry.connect(outsider).registerMerchant("m", "t", DEST_ALPHA, "Display")
      ).to.be.revertedWith("Not admin");
    });

    it("owner can grant and revoke admin", async function () {
      await expect(registry.connect(owner).addAdmin(admin.address))
        .to.emit(registry, "AdminAdded")
        .withArgs(admin.address);
      expect(await registry.isAdmin(admin.address)).to.be.true;

      await registry.connect(admin).registerMerchant("m", "t", DEST_ALPHA, "Display");

      await expect(registry.connect(owner).removeAdmin(admin.address))
        .to.emit(registry, "AdminRemoved")
        .withArgs(admin.address);
      expect(await registry.isAdmin(admin.address)).to.be.false;
    });

    it("non-super-admin cannot grant admin", async function () {
      await expect(
        registry.connect(outsider).addAdmin(outsider.address)
      ).to.be.revertedWith("Not super admin");
    });

    it("owner cannot demote themselves", async function () {
      await expect(
        registry.connect(owner).removeAdmin(owner.address)
      ).to.be.revertedWith("Cannot demote owner");
    });

    it("transferOwnership moves owner and seeds admin role for new owner", async function () {
      await expect(registry.connect(owner).transferOwnership(admin.address))
        .to.emit(registry, "OwnershipTransferred")
        .withArgs(owner.address, admin.address);
      expect(await registry.owner()).to.equal(admin.address);
      expect(await registry.isAdmin(admin.address)).to.be.true;
      expect(await registry.isSuperAdmin(admin.address)).to.be.true;
    });
  });

  describe("Super admin role", function () {
    it("addSuperAdmin promotes to both super admin and admin", async function () {
      const tx = await registry.connect(owner).addSuperAdmin(admin.address);
      await expect(tx).to.emit(registry, "SuperAdminAdded").withArgs(admin.address);
      await expect(tx).to.emit(registry, "AdminAdded").withArgs(admin.address);
      expect(await registry.isSuperAdmin(admin.address)).to.be.true;
      expect(await registry.isAdmin(admin.address)).to.be.true;
    });

    it("addSuperAdmin on an existing admin emits only SuperAdminAdded", async function () {
      await registry.connect(owner).addAdmin(admin.address);
      const tx = await registry.connect(owner).addSuperAdmin(admin.address);
      const receipt = await tx.wait();
      const adminAdded = receipt.logs
        .map((l) => {
          try {
            return registry.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .filter((p) => p && p.name === "AdminAdded");
      expect(adminAdded.length).to.equal(0);
      await expect(tx).to.emit(registry, "SuperAdminAdded").withArgs(admin.address);
    });

    it("a non-owner super admin can manage admins and super admins", async function () {
      await registry.connect(owner).addSuperAdmin(admin.address);

      await registry.connect(admin).addAdmin(outsider.address);
      expect(await registry.isAdmin(outsider.address)).to.be.true;

      await registry.connect(admin).removeAdmin(outsider.address);
      expect(await registry.isAdmin(outsider.address)).to.be.false;

      await registry.connect(admin).bulkAddAdmins([outsider.address]);
      expect(await registry.isAdmin(outsider.address)).to.be.true;

      await registry.connect(admin).addSuperAdmin(outsider.address);
      expect(await registry.isSuperAdmin(outsider.address)).to.be.true;

      await registry.connect(admin).removeSuperAdmin(outsider.address);
      expect(await registry.isSuperAdmin(outsider.address)).to.be.false;
    });

    it("a normal admin cannot grant admin", async function () {
      await registry.connect(owner).addAdmin(admin.address);
      await expect(
        registry.connect(admin).addAdmin(outsider.address)
      ).to.be.revertedWith("Not super admin");
    });

    it("an outsider cannot add a super admin", async function () {
      await expect(
        registry.connect(outsider).addSuperAdmin(outsider.address)
      ).to.be.revertedWith("Not super admin");
    });

    it("addSuperAdmin rejects the zero address", async function () {
      await expect(
        registry.connect(owner).addSuperAdmin(ethers.ZeroAddress)
      ).to.be.revertedWith("Zero super admin");
    });

    it("addSuperAdmin rejects a duplicate", async function () {
      await registry.connect(owner).addSuperAdmin(admin.address);
      await expect(
        registry.connect(owner).addSuperAdmin(admin.address)
      ).to.be.revertedWith("Already super admin");
    });

    it("removeSuperAdmin cannot demote the owner", async function () {
      await expect(
        registry.connect(owner).removeSuperAdmin(owner.address)
      ).to.be.revertedWith("Cannot demote owner");
    });

    it("removeSuperAdmin reverts on a non-super-admin target", async function () {
      await expect(
        registry.connect(owner).removeSuperAdmin(outsider.address)
      ).to.be.revertedWith("Not super admin");
    });

    it("removeSuperAdmin demotes to a normal admin", async function () {
      await registry.connect(owner).addSuperAdmin(admin.address);
      await expect(registry.connect(owner).removeSuperAdmin(admin.address))
        .to.emit(registry, "SuperAdminRemoved")
        .withArgs(admin.address);
      expect(await registry.isSuperAdmin(admin.address)).to.be.false;
      expect(await registry.isAdmin(admin.address)).to.be.true;
      await registry.connect(admin).registerMerchant("m", "t", DEST_ALPHA, "Display");
      await expect(
        registry.connect(admin).addAdmin(outsider.address)
      ).to.be.revertedWith("Not super admin");
    });

    it("removeAdmin refuses while the target is still a super admin", async function () {
      await registry.connect(owner).addSuperAdmin(admin.address);
      await expect(
        registry.connect(owner).removeAdmin(admin.address)
      ).to.be.revertedWith("Demote super admin first");
      await registry.connect(owner).removeSuperAdmin(admin.address);
      await expect(registry.connect(owner).removeAdmin(admin.address))
        .to.emit(registry, "AdminRemoved")
        .withArgs(admin.address);
      expect(await registry.isAdmin(admin.address)).to.be.false;
    });

    it("role mutations leave the version unchanged", async function () {
      const before = await registry.getVersion();
      await registry.connect(owner).addSuperAdmin(admin.address);
      await registry.connect(owner).addAdmin(outsider.address);
      await registry.connect(owner).removeSuperAdmin(admin.address);
      await registry.connect(owner).removeAdmin(admin.address);
      expect(await registry.getVersion()).to.equal(before);
    });
  });

  describe("registerMerchant", function () {
    it("happy path: writes the row, bumps version, emits event", async function () {
      const key = expectedKey("funkhaus", "bar-east-01");

      await expect(
        registry.registerMerchant(
          "funkhaus",
          "bar-east-01",
          DEST_ALPHA,
          "Bar East (Funkhaus)"
        )
      )
        .to.emit(registry, "MerchantRegistered")
        .withArgs(key, "funkhaus", "bar-east-01", DEST_ALPHA);

      expect(await registry.getVersion()).to.equal(1);
      expect(await registry.getMerchantCount()).to.equal(1);

      const byKey = await registry.getMerchantByKey(key);
      expect(byKey.exists).to.be.true;
      expect(byKey.merchantId).to.equal("funkhaus");
      expect(byKey.terminalId).to.equal("bar-east-01");
      expect(byKey.destinationAccountId).to.equal(DEST_ALPHA);
      expect(byKey.displayName).to.equal("Bar East (Funkhaus)");
      expect(byKey.status).to.equal(STATUS_ACTIVE);
      expect(byKey.addedAt).to.equal(byKey.updatedAt);

      const byIds = await registry.getMerchant("funkhaus", "bar-east-01");
      expect(byIds.destinationAccountId).to.equal(DEST_ALPHA);
      expect(byIds.status).to.equal(STATUS_ACTIVE);

      const keys = await registry.getAllTerminalKeys();
      expect(keys).to.deep.equal([key]);
    });

    it("allows an empty displayName (optional)", async function () {
      const key = expectedKey("m", "t");
      await registry.registerMerchant("m", "t", DEST_ALPHA, "");
      const entry = await registry.getMerchantByKey(key);
      expect(entry.exists).to.be.true;
      expect(entry.displayName).to.equal("");
      expect(entry.status).to.equal(STATUS_ACTIVE);
    });

    it("rejects duplicate (merchantId, terminalId)", async function () {
      await registry.registerMerchant("m", "t", DEST_ALPHA, "d");
      await expect(
        registry.registerMerchant("m", "t", DEST_BETA, "d")
      ).to.be.revertedWith("Merchant exists");
    });

    it("rejects empty identifiers", async function () {
      await expect(
        registry.registerMerchant("", "t", DEST_ALPHA, "d")
      ).to.be.revertedWith("Empty merchantId");
      await expect(
        registry.registerMerchant("m", "", DEST_ALPHA, "d")
      ).to.be.revertedWith("Empty terminalId");
    });

    it("rejects zero destination", async function () {
      await expect(
        registry.registerMerchant("m", "t", ethers.ZeroHash, "d")
      ).to.be.revertedWith("Zero destination");
    });

    it("returns an empty struct for an unknown merchant", async function () {
      const entry = await registry.getMerchant("nope", "nope");
      expect(entry.exists).to.be.false;
      expect(entry.destinationAccountId).to.equal(ethers.ZeroHash);
    });
  });

  describe("updateMerchant", function () {
    const merchantId = "funkhaus";
    const terminalId = "bar-east-01";
    let key: string;

    beforeEach(async function () {
      key = expectedKey(merchantId, terminalId);
      await registry.registerMerchant(merchantId, terminalId, DEST_ALPHA, "Bar East v1");
    });

    it("rewrites destination + displayName, preserves identity, addedAt, and status", async function () {
      const before = await registry.getMerchantByKey(key);
      const addedAt = before.addedAt;

      await expect(
        registry.updateMerchant(merchantId, terminalId, DEST_BETA, "Bar East v2")
      )
        .to.emit(registry, "MerchantUpdated")
        .withArgs(key, DEST_BETA, "Bar East v2");

      const entry = await registry.getMerchantByKey(key);
      expect(entry.destinationAccountId).to.equal(DEST_BETA);
      expect(entry.displayName).to.equal("Bar East v2");
      expect(entry.status).to.equal(STATUS_ACTIVE);
      expect(entry.addedAt).to.equal(addedAt);
      // updatedAt must move (block.timestamp progressed at least once in hardhat).
      expect(entry.updatedAt).to.be.gte(entry.addedAt);

      expect(await registry.getVersion()).to.equal(2);
    });

    it("preserves paused status across destination/displayName updates", async function () {
      await registry.setMerchantStatus(merchantId, terminalId, STATUS_PAUSED);
      await registry.updateMerchant(merchantId, terminalId, DEST_BETA, "Bar East v2");

      const entry = await registry.getMerchantByKey(key);
      expect(entry.destinationAccountId).to.equal(DEST_BETA);
      expect(entry.status).to.equal(STATUS_PAUSED);
    });

    it("rejects update for unknown merchant", async function () {
      await expect(
        registry.updateMerchant("nope", "nope", DEST_BETA, "d")
      ).to.be.revertedWith("Unknown merchant");
    });

    it("rejects zero destination", async function () {
      await expect(
        registry.updateMerchant(merchantId, terminalId, ethers.ZeroHash, "d")
      ).to.be.revertedWith("Zero destination");
    });

    it("allows updating displayName to empty", async function () {
      await registry.updateMerchant(merchantId, terminalId, DEST_BETA, "");
      const entry = await registry.getMerchantByKey(key);
      expect(entry.displayName).to.equal("");
    });
  });

  describe("setMerchantDestination", function () {
    const merchantId = "funkhaus";
    const terminalId = "bar-east-01";
    let key: string;

    beforeEach(async function () {
      key = expectedKey(merchantId, terminalId);
      await registry.registerMerchant(merchantId, terminalId, DEST_ALPHA, "Bar East");
    });

    it("rotates the destination while leaving displayName, status, and addedAt untouched", async function () {
      const before = await registry.getMerchantByKey(key);

      await expect(registry.setMerchantDestination(merchantId, terminalId, DEST_BETA))
        .to.emit(registry, "MerchantDestinationChanged")
        .withArgs(key, DEST_ALPHA, DEST_BETA);

      const after = await registry.getMerchantByKey(key);
      expect(after.destinationAccountId).to.equal(DEST_BETA);
      expect(after.displayName).to.equal(before.displayName);
      expect(after.status).to.equal(before.status);
      expect(after.addedAt).to.equal(before.addedAt);
      expect(after.updatedAt).to.be.gte(before.updatedAt);

      expect(await registry.getVersion()).to.equal(2);
    });

    it("preserves Paused status across a destination rotation", async function () {
      await registry.setMerchantStatus(merchantId, terminalId, STATUS_PAUSED);
      await registry.setMerchantDestination(merchantId, terminalId, DEST_BETA);

      const entry = await registry.getMerchantByKey(key);
      expect(entry.destinationAccountId).to.equal(DEST_BETA);
      expect(entry.status).to.equal(STATUS_PAUSED);
    });

    it("does NOT emit MerchantUpdated — the dedicated event is the audit trail for address rotations", async function () {
      await expect(registry.setMerchantDestination(merchantId, terminalId, DEST_BETA)).to.not.emit(
        registry,
        "MerchantUpdated",
      );
    });

    it("reverts when the merchant does not exist", async function () {
      await expect(
        registry.setMerchantDestination("nope", "nope", DEST_BETA),
      ).to.be.revertedWith("Unknown merchant");
    });

    it("reverts on zero destination", async function () {
      await expect(
        registry.setMerchantDestination(merchantId, terminalId, ethers.ZeroHash),
      ).to.be.revertedWith("Zero destination");
    });

    it("reverts when the destination is unchanged so version never bumps on a no-op", async function () {
      const versionBefore = await registry.getVersion();
      await expect(
        registry.setMerchantDestination(merchantId, terminalId, DEST_ALPHA),
      ).to.be.revertedWith("Destination unchanged");
      expect(await registry.getVersion()).to.equal(versionBefore);
    });

    it("rejects non-admin writes", async function () {
      await expect(
        registry.connect(outsider).setMerchantDestination(merchantId, terminalId, DEST_BETA),
      ).to.be.revertedWith("Not admin");
    });
  });

  describe("setMerchantStatus", function () {
    const merchantId = "funkhaus";
    const terminalId = "bar-east-01";
    let key: string;

    beforeEach(async function () {
      key = expectedKey(merchantId, terminalId);
      await registry.registerMerchant(merchantId, terminalId, DEST_ALPHA, "Bar East");
    });

    it("transitions to Paused, Revoked, and back to Active", async function () {
      await expect(registry.setMerchantStatus(merchantId, terminalId, STATUS_PAUSED))
        .to.emit(registry, "MerchantStatusChanged")
        .withArgs(key, STATUS_ACTIVE, STATUS_PAUSED);
      expect((await registry.getMerchantByKey(key)).status).to.equal(STATUS_PAUSED);

      await expect(registry.setMerchantStatus(merchantId, terminalId, STATUS_REVOKED))
        .to.emit(registry, "MerchantStatusChanged")
        .withArgs(key, STATUS_PAUSED, STATUS_REVOKED);
      expect((await registry.getMerchantByKey(key)).status).to.equal(STATUS_REVOKED);

      await expect(registry.setMerchantStatus(merchantId, terminalId, STATUS_ACTIVE))
        .to.emit(registry, "MerchantStatusChanged")
        .withArgs(key, STATUS_REVOKED, STATUS_ACTIVE);
      expect((await registry.getMerchantByKey(key)).status).to.equal(STATUS_ACTIVE);
    });

    it("rejects non-admin status writes", async function () {
      await expect(
        registry.connect(outsider).setMerchantStatus(merchantId, terminalId, STATUS_PAUSED)
      ).to.be.revertedWith("Not admin");
    });

    it("rejects unknown merchant status writes", async function () {
      await expect(
        registry.setMerchantStatus("nope", "nope", STATUS_PAUSED)
      ).to.be.revertedWith("Unknown merchant");
    });

    it("rejects same-status updates without bumping version", async function () {
      expect(await registry.getVersion()).to.equal(1);

      await expect(
        registry.setMerchantStatus(merchantId, terminalId, STATUS_ACTIVE)
      ).to.be.revertedWith("Status unchanged");

      expect(await registry.getVersion()).to.equal(1);
    });

    it("bumps version and updatedAt on status mutation", async function () {
      const before = await registry.getMerchantByKey(key);
      expect(await registry.getVersion()).to.equal(1);

      await registry.setMerchantStatus(merchantId, terminalId, STATUS_PAUSED);

      const after = await registry.getMerchantByKey(key);
      expect(after.status).to.equal(STATUS_PAUSED);
      expect(after.updatedAt).to.be.gte(before.updatedAt);
      expect(await registry.getVersion()).to.equal(2);
    });
  });

  describe("removeMerchant", function () {
    it("clears the row and shrinks enumeration", async function () {
      await registry.registerMerchant("m1", "t1", DEST_ALPHA, "d1");
      await registry.registerMerchant("m2", "t2", DEST_BETA, "d2");
      await registry.registerMerchant("m3", "t3", DEST_GAMMA, "d3");
      await registry.setMerchantStatus("m2", "t2", STATUS_REVOKED);

      const keyMid = expectedKey("m2", "t2");
      await expect(registry.removeMerchant("m2", "t2"))
        .to.emit(registry, "MerchantRemoved")
        .withArgs(keyMid, "m2", "t2");

      expect(await registry.getMerchantCount()).to.equal(2);
      expect((await registry.getMerchantByKey(keyMid)).exists).to.be.false;

      // Swap-and-pop leaves m1 + m3 (order may shuffle).
      const keys = Array.from(await registry.getAllTerminalKeys());
      expect(keys).to.have.members([
        expectedKey("m1", "t1"),
        expectedKey("m3", "t3"),
      ]);
    });

    it("rejects removal of unknown merchant", async function () {
      await expect(
        registry.removeMerchant("nope", "nope")
      ).to.be.revertedWith("Unknown merchant");
    });

    it("allows re-registration after removal", async function () {
      await registry.registerMerchant("m", "t", DEST_ALPHA, "d");
      await registry.removeMerchant("m", "t");
      await registry.registerMerchant("m", "t", DEST_BETA, "d2");
      const entry = await registry.getMerchant("m", "t");
      expect(entry.destinationAccountId).to.equal(DEST_BETA);
      expect(entry.status).to.equal(STATUS_ACTIVE);
    });
  });

  describe("Version monotonicity", function () {
    it("bumps once per mutation and never on a revert", async function () {
      expect(await registry.getVersion()).to.equal(0);

      await registry.registerMerchant("m1", "t1", DEST_ALPHA, "d");
      expect(await registry.getVersion()).to.equal(1);

      await expect(
        registry.registerMerchant("m1", "t1", DEST_BETA, "d")
      ).to.be.reverted;
      expect(await registry.getVersion()).to.equal(1);

      await registry.updateMerchant("m1", "t1", DEST_BETA, "d2");
      expect(await registry.getVersion()).to.equal(2);

      await registry.setMerchantStatus("m1", "t1", STATUS_PAUSED);
      expect(await registry.getVersion()).to.equal(3);

      await registry.removeMerchant("m1", "t1");
      expect(await registry.getVersion()).to.equal(4);
    });
  });

  describe("terminalKey purity", function () {
    it("matches the off-chain keccak(merchantId || '|' || terminalId)", async function () {
      const onChain = await registry.terminalKey("funkhaus", "bar-east-01");
      expect(onChain).to.equal(expectedKey("funkhaus", "bar-east-01"));
    });
  });

  describe("Item configs", function () {
    const CONFIG_ID = "bar";
    const CID = "bafkreigh2akiscaildc26b3xbcoab4y3afyywjcttzkv6f7vfyqgwwxe7q";
    const CID_V2 = "bafkreihy42dxn4tewovkc2eivlb6srpxqg6w7n2pmtsh66wpodyl6pikje";
    const SIZE = 412;
    const SIZE_V2 = 480;

    it("upsertItemConfig creates, bumps shared version, and emits ItemConfigUpserted", async function () {
      expect(await registry.getItemConfigCount()).to.equal(0);

      await expect(
        registry.upsertItemConfig(CONFIG_ID, CID, SIZE)
      )
        .to.emit(registry, "ItemConfigUpserted")
        .withArgs(CONFIG_ID, CID, SIZE);

      expect(await registry.getVersion()).to.equal(1);
      expect(await registry.getItemConfigCount()).to.equal(1);

      const record = await registry.getItemConfig(CONFIG_ID);
      expect(record.exists).to.be.true;
      expect(record.configId).to.equal(CONFIG_ID);
      expect(record.cid).to.equal(CID);
      expect(record.size).to.equal(SIZE);
      expect(record.updatedAt).to.be.gt(0);

      const ids = await registry.getAllItemConfigIds();
      expect(ids).to.deep.equal([CONFIG_ID]);
    });

    it("upsertItemConfig updates an existing record without growing enumeration", async function () {
      await registry.upsertItemConfig(CONFIG_ID, CID, SIZE);
      const before = await registry.getItemConfig(CONFIG_ID);

      await expect(
        registry.upsertItemConfig(CONFIG_ID, CID_V2, SIZE_V2)
      )
        .to.emit(registry, "ItemConfigUpserted")
        .withArgs(CONFIG_ID, CID_V2, SIZE_V2);

      expect(await registry.getVersion()).to.equal(2);
      expect(await registry.getItemConfigCount()).to.equal(1);

      const after = await registry.getItemConfig(CONFIG_ID);
      expect(after.cid).to.equal(CID_V2);
      expect(after.size).to.equal(SIZE_V2);
      expect(after.updatedAt).to.be.gte(before.updatedAt);
    });

    it("removeItemConfig clears the record, emits, and shrinks enumeration", async function () {
      await registry.upsertItemConfig("bar", CID, SIZE);
      await registry.upsertItemConfig("cafe", CID_V2, SIZE_V2);
      await registry.upsertItemConfig("restaurant", CID, SIZE);
      expect(await registry.getItemConfigCount()).to.equal(3);

      await expect(registry.removeItemConfig("cafe"))
        .to.emit(registry, "ItemConfigRemoved")
        .withArgs("cafe");

      expect(await registry.getItemConfigCount()).to.equal(2);
      const cafe = await registry.getItemConfig("cafe");
      expect(cafe.exists).to.be.false;

      // Swap-and-pop preserves the remaining ids (order may shuffle).
      const ids = Array.from(await registry.getAllItemConfigIds());
      expect(ids).to.have.members(["bar", "restaurant"]);
    });

    it("non-admin writes revert with 'Not admin'", async function () {
      await expect(
        registry
          .connect(outsider)
          .upsertItemConfig(CONFIG_ID, CID, SIZE)
      ).to.be.revertedWith("Not admin");
      await registry.upsertItemConfig(CONFIG_ID, CID, SIZE);
      await expect(
        registry.connect(outsider).removeItemConfig(CONFIG_ID)
      ).to.be.revertedWith("Not admin");
    });

    it("rejects empty configId, empty cid, zero size", async function () {
      await expect(
        registry.upsertItemConfig("", CID, SIZE)
      ).to.be.revertedWith("Empty configId");
      await expect(
        registry.upsertItemConfig(CONFIG_ID, "", SIZE)
      ).to.be.revertedWith("Empty cid");
      await expect(
        registry.upsertItemConfig(CONFIG_ID, CID, 0)
      ).to.be.revertedWith("Zero size");
    });

    it("removeItemConfig on unknown config reverts", async function () {
      await expect(registry.removeItemConfig("nope")).to.be.revertedWith("Unknown itemConfig");
    });

    it("enumeration stays stable across mixed merchant + item-config mutations", async function () {
      await registry.registerMerchant("m1", "t1", DEST_ALPHA, "d1");
      await registry.upsertItemConfig("a", CID, SIZE);
      await registry.upsertItemConfig("b", CID_V2, SIZE_V2);
      await registry.registerMerchant("m2", "t2", DEST_BETA, "d2");
      await registry.upsertItemConfig("c", CID, SIZE);
      await registry.removeMerchant("m1", "t1");
      await registry.removeItemConfig("b");

      const merchantKeys = Array.from(await registry.getAllTerminalKeys());
      expect(merchantKeys).to.have.members([expectedKey("m2", "t2")]);

      const configIds = Array.from(await registry.getAllItemConfigIds());
      expect(configIds).to.have.members(["a", "c"]);
    });

    it("admins granted via addAdmin can publish item configs without a second grant", async function () {
      await registry.addAdmin(admin.address);
      await expect(
        registry
          .connect(admin)
          .upsertItemConfig(CONFIG_ID, CID, SIZE)
      )
        .to.emit(registry, "ItemConfigUpserted")
        .withArgs(CONFIG_ID, CID, SIZE);

      await expect(registry.connect(admin).removeItemConfig(CONFIG_ID))
        .to.emit(registry, "ItemConfigRemoved")
        .withArgs(CONFIG_ID);
    });
  });

  describe("Processor configs", function () {
    const GROUP_ID = "funkhaus-zola";
    const CID = "bafkreigh2akiscaildc26b3xbcoab4y3afyywjcttzkv6f7vfyqgwwxe7q";
    const CID_V2 = "bafkreihy42dxn4tewovkc2eivlb6srpxqg6w7n2pmtsh66wpodyl6pikje";
    const SIZE = 512;
    const SIZE_V2 = 640;

    it("upsertProcessorConfig creates, bumps version, emits", async function () {
      expect(await registry.getProcessorConfigCount()).to.equal(0);

      await expect(registry.upsertProcessorConfig(GROUP_ID, CID, SIZE))
        .to.emit(registry, "ProcessorConfigUpserted")
        .withArgs(GROUP_ID, CID, SIZE);

      expect(await registry.getVersion()).to.equal(1);
      expect(await registry.getProcessorConfigCount()).to.equal(1);

      const rec = await registry.getProcessorConfig(GROUP_ID);
      expect(rec.exists).to.be.true;
      expect(rec.groupId).to.equal(GROUP_ID);
      expect(rec.cid).to.equal(CID);
      expect(rec.size).to.equal(SIZE);
      expect(rec.updatedAt).to.be.gt(0);
      expect(await registry.getAllProcessorConfigIds()).to.deep.equal([GROUP_ID]);
    });

    it("upsertProcessorConfig updates an existing record without growing enumeration", async function () {
      await registry.upsertProcessorConfig(GROUP_ID, CID, SIZE);
      await expect(registry.upsertProcessorConfig(GROUP_ID, CID_V2, SIZE_V2))
        .to.emit(registry, "ProcessorConfigUpserted")
        .withArgs(GROUP_ID, CID_V2, SIZE_V2);

      expect(await registry.getVersion()).to.equal(2);
      expect(await registry.getProcessorConfigCount()).to.equal(1);
      const rec = await registry.getProcessorConfig(GROUP_ID);
      expect(rec.cid).to.equal(CID_V2);
      expect(rec.size).to.equal(SIZE_V2);
    });

    it("removeProcessorConfig clears, emits, shrinks enumeration", async function () {
      await registry.upsertProcessorConfig("a", CID, SIZE);
      await registry.upsertProcessorConfig("b", CID_V2, SIZE_V2);
      await registry.upsertProcessorConfig("c", CID, SIZE);

      await expect(registry.removeProcessorConfig("b"))
        .to.emit(registry, "ProcessorConfigRemoved")
        .withArgs("b");

      expect(await registry.getProcessorConfigCount()).to.equal(2);
      expect((await registry.getProcessorConfig("b")).exists).to.be.false;
      expect(Array.from(await registry.getAllProcessorConfigIds())).to.have.members(["a", "c"]);
    });

    it("onlyAdmin gating + empty-field reverts", async function () {
      await expect(
        registry.connect(outsider).upsertProcessorConfig(GROUP_ID, CID, SIZE)
      ).to.be.revertedWith("Not admin");
      await expect(registry.upsertProcessorConfig("", CID, SIZE)).to.be.revertedWith("Empty groupId");
      await expect(registry.upsertProcessorConfig(GROUP_ID, "", SIZE)).to.be.revertedWith("Empty cid");
      await expect(registry.upsertProcessorConfig(GROUP_ID, CID, 0)).to.be.revertedWith("Zero size");
      await expect(registry.removeProcessorConfig("nope")).to.be.revertedWith("Unknown processorConfig");
    });
  });

  describe("Merchant profiles", function () {
    const GROUP_ID = "funkhaus-zola";
    const NAME = "Zola";
    const MERCHANT_ID = "funkhaus";

    it("upsertMerchantProfile creates, bumps version, emits, round-trips all fields", async function () {
      expect(await registry.getMerchantProfileCount()).to.equal(0);

      await expect(
        registry.upsertMerchantProfile(GROUP_ID, NAME, MERCHANT_ID, "1 Main St", "Suite 2", "+49 30 123", "DE123")
      )
        .to.emit(registry, "MerchantProfileUpserted")
        .withArgs(GROUP_ID, NAME, MERCHANT_ID);

      expect(await registry.getVersion()).to.equal(1);
      expect(await registry.getMerchantProfileCount()).to.equal(1);

      const p = await registry.getMerchantProfile(GROUP_ID);
      expect(p.exists).to.be.true;
      expect(p.groupId).to.equal(GROUP_ID);
      expect(p.merchantName).to.equal(NAME);
      expect(p.merchantId).to.equal(MERCHANT_ID);
      expect(p.addressLine1).to.equal("1 Main St");
      expect(p.addressLine2).to.equal("Suite 2");
      expect(p.phone).to.equal("+49 30 123");
      expect(p.taxId).to.equal("DE123");
      expect(p.updatedAt).to.be.gt(0);
      expect(await registry.getAllMerchantProfileIds()).to.deep.equal([GROUP_ID]);
    });

    it("update does not grow enumeration", async function () {
      await registry.upsertMerchantProfile(GROUP_ID, NAME, MERCHANT_ID, "", "", "", "");
      await registry.upsertMerchantProfile(GROUP_ID, "Zola Bar", MERCHANT_ID, "", "", "", "");
      expect(await registry.getMerchantProfileCount()).to.equal(1);
      expect((await registry.getMerchantProfile(GROUP_ID)).merchantName).to.equal("Zola Bar");
    });

    it("remove clears and shrinks enumeration", async function () {
      await registry.upsertMerchantProfile("a", "A", "ma", "", "", "", "");
      await registry.upsertMerchantProfile("b", "B", "mb", "", "", "", "");
      await expect(registry.removeMerchantProfile("a"))
        .to.emit(registry, "MerchantProfileRemoved")
        .withArgs("a");
      expect(await registry.getMerchantProfileCount()).to.equal(1);
      expect((await registry.getMerchantProfile("a")).exists).to.be.false;
      expect(Array.from(await registry.getAllMerchantProfileIds())).to.have.members(["b"]);
    });

    it("onlyAdmin gating + empty-field reverts", async function () {
      await expect(
        registry.connect(outsider).upsertMerchantProfile(GROUP_ID, NAME, MERCHANT_ID, "", "", "", "")
      ).to.be.revertedWith("Not admin");
      await expect(
        registry.upsertMerchantProfile("", NAME, MERCHANT_ID, "", "", "", "")
      ).to.be.revertedWith("Empty groupId");
      await expect(
        registry.upsertMerchantProfile(GROUP_ID, "", MERCHANT_ID, "", "", "", "")
      ).to.be.revertedWith("Empty merchantName");
      await expect(
        registry.upsertMerchantProfile(GROUP_ID, NAME, "", "", "", "", "")
      ).to.be.revertedWith("Empty merchantId");
      await expect(registry.removeMerchantProfile("nope")).to.be.revertedWith("Unknown merchantProfile");
    });
  });

  describe("Processor reports", function () {
    const GROUP_ID = "funkhaus-zola";
    const CID = "bafkreigh2akiscaildc26b3xbcoab4y3afyywjcttzkv6f7vfyqgwwxe7q";
    const CID_V2 = "bafkreihy42dxn4tewovkc2eivlb6srpxqg6w7n2pmtsh66wpodyl6pikje";
    const SIZE = 300;

    it("permissionless write by a non-admin succeeds and emits with writer", async function () {
      await expect(registry.connect(outsider).addProcessorReport(GROUP_ID, 1, CID, SIZE))
        .to.emit(registry, "ProcessorReportAdded")
        .withArgs(GROUP_ID, 1, CID, SIZE, outsider.address);

      expect(await registry.getProcessorReportCount(GROUP_ID)).to.equal(1);
      const rec = await registry.getProcessorReport(GROUP_ID, 1);
      expect(rec.exists).to.be.true;
      expect(rec.seq).to.equal(1);
      expect(rec.cid).to.equal(CID);
      expect(rec.size).to.equal(SIZE);
      expect(rec.committedAt).to.be.gt(0);
      expect(Array.from(await registry.getProcessorReportSeqs(GROUP_ID))).to.deep.equal([1n]);
    });

    it("re-adding the same (groupId, seq) with the same cid is a no-op", async function () {
      await registry.connect(outsider).addProcessorReport(GROUP_ID, 7, CID, SIZE);
      const versionAfterFirst = await registry.getVersion();
      await expect(
        registry.connect(outsider).addProcessorReport(GROUP_ID, 7, CID, SIZE)
      ).to.not.emit(registry, "ProcessorReportAdded");
      expect(await registry.getProcessorReportCount(GROUP_ID)).to.equal(1);
      expect(await registry.getVersion()).to.equal(versionAfterFirst);
    });

    it("re-adding the same (groupId, seq) with a different cid reverts (immutable)", async function () {
      await registry.connect(outsider).addProcessorReport(GROUP_ID, 7, CID, SIZE);
      await expect(
        registry.connect(outsider).addProcessorReport(GROUP_ID, 7, CID_V2, SIZE)
      ).to.be.revertedWith("Report exists");
    });

    it("rejects empty groupId, empty cid, zero size", async function () {
      await expect(registry.addProcessorReport("", 1, CID, SIZE)).to.be.revertedWith("Empty groupId");
      await expect(registry.addProcessorReport(GROUP_ID, 1, "", SIZE)).to.be.revertedWith("Empty cid");
      await expect(registry.addProcessorReport(GROUP_ID, 1, CID, 0)).to.be.revertedWith("Zero size");
    });

    it("distinct seqs accumulate under one group", async function () {
      await registry.addProcessorReport(GROUP_ID, 1, CID, SIZE);
      await registry.addProcessorReport(GROUP_ID, 2, CID_V2, SIZE);
      expect(await registry.getProcessorReportCount(GROUP_ID)).to.equal(2);
      expect(Array.from(await registry.getProcessorReportSeqs(GROUP_ID))).to.deep.equal([1n, 2n]);
    });
  });

  describe("bulkAddAdmins", function () {
    it("owner adds an array; each becomes admin with one AdminAdded per new admin", async function () {
      const tx = await registry.bulkAddAdmins([admin.address, outsider.address]);
      await expect(tx).to.emit(registry, "AdminAdded").withArgs(admin.address);
      await expect(tx).to.emit(registry, "AdminAdded").withArgs(outsider.address);
      expect(await registry.isAdmin(admin.address)).to.be.true;
      expect(await registry.isAdmin(outsider.address)).to.be.true;
    });

    it("already-admin entries are skipped (no duplicate event)", async function () {
      await registry.addAdmin(admin.address);
      const tx = await registry.bulkAddAdmins([owner.address, admin.address, outsider.address]);
      const receipt = await tx.wait();
      const added = receipt.logs
        .map((l) => {
          try {
            return registry.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .filter((p) => p && p.name === "AdminAdded");
      expect(added.length).to.equal(1);
      expect(added[0].args[0]).to.equal(outsider.address);
    });

    it("reverts on the zero address", async function () {
      await expect(registry.bulkAddAdmins([ethers.ZeroAddress])).to.be.revertedWith("Zero admin");
    });

    it("non-super-admin cannot bulk-add", async function () {
      await expect(
        registry.connect(outsider).bulkAddAdmins([outsider.address])
      ).to.be.revertedWith("Not super admin");
    });

    it("a bulk-added admin can then upsert a processor config", async function () {
      await registry.bulkAddAdmins([admin.address]);
      await expect(
        registry.connect(admin).upsertProcessorConfig("g", "bafy-cid", 100)
      ).to.emit(registry, "ProcessorConfigUpserted");
    });
  });
});
