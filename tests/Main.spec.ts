import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, address, toNano } from '@ton/core';
import { Main } from '../wrappers/Main';
import '@ton/test-utils';

describe('Main', () => {
	let blockchain: Blockchain;
	let deployer: SandboxContract<TreasuryContract>;
	let main: SandboxContract<Main>;
	let random: SandboxContract<TreasuryContract>;

	beforeEach(async () => {
		blockchain = await Blockchain.create();

		main = blockchain.openContract(await Main.fromInit(5000n));

		deployer = await blockchain.treasury('deployer');
		random = await blockchain.treasury('random');

		const deployResult = await main.send(
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
			to: main.address,
			deploy: true,
			success: true,
		});
	});

	it('should deploy', async () => {
		// the check is done inside beforeEach
		// blockchain and main are ready to use
	});

	it('should create deal', async () => {
		let arbiter = await blockchain.treasury('arbiter');
		let creator = await blockchain.treasury('creator');

		// console.log(`Deployer: ${deployer.address}`);
		// console.log(`Main: ${main.address}`);
		// console.log(`Creator: ${creator.address}`);

		const res = await main.send(creator.getSender(), {
			value: toNano('11')
		}, {
			$$type: 'NewDeal',
			arbiter: arbiter.address,
			arbiterFee: 10000n,
			amount: toNano('10')
		});

		const deal = res.transactions[2].inMessage?.info.dest as Address;
		// console.log(`Deal: ${deal}`);

		expect(res.transactions).toHaveTransaction({
			from: creator.address,
			to: main.address,
			success: true,
		});

		expect(res.transactions).toHaveTransaction({
			from: main.address,
			to: deal,
			success: true,
		});

		expect(res.transactions).toHaveTransaction({
			to: creator.address,
			success: true,
		});


	});

});
