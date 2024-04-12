import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, address, toNano } from '@ton/core';
import { Deal } from '../wrappers/Deal';
import '@ton/test-utils';

describe('Deal', () => {
	let blockchain: Blockchain;
	let deployer: SandboxContract<TreasuryContract>;
	let deal: SandboxContract<Deal>;
	let arbiter: SandboxContract<TreasuryContract>;
	let creator: SandboxContract<TreasuryContract>;
	let random: SandboxContract<TreasuryContract>;

	beforeEach(async () => {
		blockchain = await Blockchain.create();
		deployer = await blockchain.treasury('deployer');
		arbiter = await blockchain.treasury('arbiter');
		random = await blockchain.treasury('random');
		creator = await blockchain.treasury('creator');

		deal = blockchain.openContract(await Deal.fromInit(
			deployer.address, arbiter.address, 10000n, 500n, 1n
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

	it('should deploy', async () => {
		// deploy
		var res = await deal.send(deployer.getSender(), {
			value: toNano('10.05')
		}, {
			$$type: 'CreateDeal',
			from: creator.address,
			amount: toNano('10'),
			approved: false
		});

		expect(res.transactions).toHaveTransaction({
			from: deployer.address,
			to: deal.address,
			success: true,
		});

		var users = await deal.getGetParticipants();
		expect(users.size).toEqual(1);
		var user = users.get(creator.address);
		expect(user).not.toBeUndefined();
		if (!user) return;
		expect(user.amount).toEqual(toNano('10'));
		expect(user.approved).toBeFalsy();

		// add amount the same user
		res = await deal.send(creator.getSender(), {
			value: toNano('10.05')
		}, {
			$$type: 'AddUser',
			amount: toNano('10'),
			approved: false
		});

		expect(res.transactions).toHaveTransaction({
			from: creator.address,
			to: deal.address,
			success: true,
		});

		var users = await deal.getGetParticipants();
		expect(users.size).toEqual(1);
		var user = users.get(creator.address);
		expect(user).not.toBeUndefined();
		if (!user) return;
		expect(user.amount).toEqual(toNano('20'));
		expect(user.approved).toBeFalsy();

		// second user
		const secondUser = await blockchain.treasury('secondUser');
		res = await deal.send(secondUser.getSender(), {
			value: toNano('10.05')
		}, {
			$$type: 'AddUser',
			amount: toNano('30'),
			approved: true
		});

		expect(res.transactions).toHaveTransaction({
			from: secondUser.address,
			to: deal.address,
			success: true,
		});

		var users = await deal.getGetParticipants();
		expect(users.size).toEqual(2);
		var user = users.get(secondUser.address);
		expect(user).not.toBeUndefined();
		if (!user) return;
		expect(user.amount).toEqual(toNano('30'));
		expect(user.approved).toBeTruthy();
		var info = await deal.getGetInfo();
		expect(info.approved).toBeFalsy();

		// creator approve
		res = await deal.send(creator.getSender(), {
			value: toNano('0.05')
		}, "approve");

		expect(res.transactions).toHaveTransaction({
			from: creator.address,
			to: deal.address,
			success: true,
		});

		info = await deal.getGetInfo();
		expect(info.approved).toBeTruthy();

	});


});