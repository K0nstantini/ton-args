import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, toNano } from '@ton/core';
import { Deal } from '../wrappers/Deal';
import '@ton/test-utils';

describe('Deal', () => {
  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let deal: SandboxContract<Deal>;
  let arbiter: SandboxContract<TreasuryContract>;
  let user1: SandboxContract<TreasuryContract>;
  let user2: SandboxContract<TreasuryContract>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    arbiter = await blockchain.treasury('arbiter');
    user1 = await blockchain.treasury('user1');
    user2 = await blockchain.treasury('user2');

    deal = blockchain.openContract(await Deal.fromInit(
      deployer.address, arbiter.address, 10000n, 5000n, 1n
    ));


    const deployResult = await deal.send(
      deployer.getSender(),
      {
        value: toNano('0.05'),
      },
      {
        $$type: 'Deploy',
        queryId: 0n,
      }
    );

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: deal.address,
      deploy: true,
      success: true,
    });
  });

  it('test1', async () => {
    await createDeal(user1, 10);
    await withdraw(user2);
    await withdraw(user1);

  });

  it('test2', async () => {
    deployNew();

    await createDeal(user1, 10);
    await addToDeal(user1, 10, false);
    await addToDeal(user2, 30, false);
    await withdraw(user1);
    await withdraw(user2);
  });

  it('test3', async () => {
    deployNew();

    await createDeal(user1, 10);
    await addToDeal(user1, 10, true);
    await addToDeal(user2, 30, false);
    await withdraw(user1);
    await withdraw(user2);
  });

  it('test4', async () => {
    deployNew();

    await createDeal(user1, 10);
    await addToDeal(user2, 10, true);
    await withdraw(user1);
    await withdraw(user2);

    // const info = await deal.getGetInfo();
    // console.log(`last calcel: ${info.lastCancel}`);
    // const users = info.participants;
    // console.log(users.get(user2.address));

  });

  it('test5', async () => {
    deployNew();

    await createDeal(user1, 10);
    await addToDeal(user2, 10, true);
    await withdraw(user2);
    await withdraw(user1);
  });

  it('test6', async () => {
    deployNew();

    await createDeal(user1, 10);
    await addToDeal(user2, 10, true);
    await addToDeal(user1, 10, true);
    await withdraw(user1);
    await withdraw(user2);
  });

  it('test7', async () => {
    deployNew();

    await createDeal(user1, 10);
    await addToDeal(user2, 10, true);
    await approve(user2);
    await withdraw(user1);
    await withdraw(user2);
  });

  it('test8', async () => {
    deployNew();

    await createDeal(user1, 10);
    await addToDeal(user2, 10, true);
    await approve(user1);
    await withdraw(user1);
    await withdraw(user2);
  });

  it('test9', async () => {
    deployNew();

    await createDeal(user1, 10);
    await addToDeal(user2, 10, true);
    await reward(user1, user1.address);
    await reward(arbiter, user1.address);
    await approve(user1);
    await reward(arbiter, arbiter.address);
    await reward(arbiter, user1.address);

  });

  it('test10', async () => {
    deployNew();

    await createDeal(user1, 10);
    await addToDeal(user2, 10, false);
    await approve(user1);
    await approve(user2);
    await withdraw(user1);
    await reward(arbiter, user2.address);

  });

  async function deployNew() {
    deal = blockchain.openContract(await Deal.fromInit(
      deployer.address, arbiter.address, 10000n, 5000n, 1n
    ));
  }


  async function createDeal(userContract: SandboxContract<TreasuryContract>, amount: number) {
    const res = await deal.send(deployer.getSender(), {
      value: toNano(amount + 0.1)
    }, {
      $$type: 'CreateDeal',
      from: userContract.address,
      amount: toNano(amount),
    });

    expect(res.transactions).toHaveTransaction({
      from: deployer.address,
      to: deal.address,
      success: true,
    });

    expect(res.transactions).toHaveTransaction({
      from: deal.address,
      to: userContract.address,
      success: true,
    });

    const user = await getUser(userContract);
    expect(user?.amount).toEqual(toNano(amount));
    expect(user?.approved).toBeFalsy();

  }

  async function addToDeal(userContract: SandboxContract<TreasuryContract>, amount: number, approve: boolean) {
    var user = await getUser(userContract);
    const userAmountBefore = user ? user.amount : 0n;

    const res = await deal.send(userContract.getSender(), {
      value: toNano(amount + 0.1)
    }, {
      $$type: 'AddUser',
      amount: toNano(amount),
      approved: approve
    });

    expect(res.transactions).toHaveTransaction({
      from: userContract.address,
      to: deal.address,
      success: true,
    });

    const info = await deal.getGetInfo();
    var user = info.participants.get(userContract.address);
    const userAmountAfter = user ? user.amount : 0n;
    expect(userAmountAfter).toEqual(userAmountBefore + toNano(amount));
    if (approve && info.participants.size > 1) {
      expect(user?.approved).toBeGreaterThan(0n);
    } else {
      expect(user?.approved).toEqual(0n);
    }

    checkApprove();
  }

  async function approve(userContract: SandboxContract<TreasuryContract>) {
    const userBefore = await getUser(userContract);

    const res = await deal.send(userContract.getSender(), {
      value: toNano('0.05')
    }, "approve");

    if (!userBefore) {
      expect(res.transactions).toHaveTransaction({
        from: userContract.address,
        to: deal.address,
        success: false,
      });
      return;
    }

    const userAfter = await getUser(userContract);
    const condition = userAfter && userBefore && userAfter.approved > userBefore.approved;
    if (!condition) {
      console.log(userBefore);
      console.log(userAfter);
    }
    expect(condition).toBeTruthy();
    checkApprove();
  }

  async function withdraw(userContract: SandboxContract<TreasuryContract>) {
    var info = await deal.getGetInfo();
    var user = info.participants.get(userContract.address);

    const res = await deal.send(userContract.getSender(), {
      value: toNano('0.05')
    }, "withdraw");

    // reject if not participant
    if (!user) {
      expect(res.transactions).toHaveTransaction({
        from: userContract.address,
        to: deal.address,
        success: false,
      });
      return;
    }

    expect(res.transactions).toHaveTransaction({
      from: userContract.address,
      to: deal.address,
      success: true,
    });


    // ok, allow to withdraw
    if (info.draw || !info.approved) {
      expect(res.transactions).toHaveTransaction({
        from: deal.address,
        to: userContract.address,
        success: true,
      });

      // fee to arbiter only if draw
      if (info.draw) {
        expect(res.transactions).toHaveTransaction({
          from: deal.address,
          to: arbiter.address,
          success: true,
        });
      }

      // last user, drop the contract
      if (info.participants.size == 1) {
        expect(res.transactions).toHaveTransaction({
          from: deal.address,
          to: deployer.address,
          success: true,
        });
        return;
      }

      // no user's approve after than last cancel time
      var info = await deal.getGetInfo();
      expect(info.lastCancel).toBeGreaterThan(0n);
      checkApprove();
      return;
    }

    expect(res.transactions).not.toHaveTransaction({
      from: deal.address,
      to: userContract.address,
    });

    var user = await getUser(userContract);
    expect(user).not.toBeUndefined();
    expect(user?.refused).toBeTruthy();
  }


  async function reward(userContract: SandboxContract<TreasuryContract>, addr: Address) {
    var info = await deal.getGetInfo();
    const user = info.participants.get(addr);

    const res = await deal.send(userContract.getSender(), {
      value: toNano('0.05')
    }, {
      $$type: 'Reward',
      addr
    });

    if (userContract.address != arbiter.address || !info.approved || info.draw) {
      expect(res.transactions).toHaveTransaction({
        from: userContract.address,
        to: deal.address,
        success: false,
      });
      return;
    }

    expect(res.transactions).toHaveTransaction({
      from: userContract.address,
      to: deal.address,
      success: true,
    });

    if (!user) {
      var info = await deal.getGetInfo();
      expect(info?.draw).toBeTruthy();
      return;
    }

    expect(res.transactions).toHaveTransaction({
      from: deal.address,
      to: addr,
      success: true,
    });

    expect(res.transactions).toHaveTransaction({
      from: deal.address,
      to: arbiter.address,
      success: true,
    });

    expect(res.transactions).toHaveTransaction({
      from: deal.address,
      to: deployer.address,
      success: true,
    });

  }

  async function getUser(userConstract: SandboxContract<TreasuryContract>) {
    const info = await deal.getGetInfo();
    return info.participants.get(userConstract.address);
  }

  async function checkApprove() {
    const info = await deal.getGetInfo();
    const users = info.participants;
    const shouldApprove = users.values().every(u => (u.approved > 0 && u.approved >= info.lastCancel) || u.refused) && users.size > 1;
    expect(info.approved).toEqual(shouldApprove);
  }

});
