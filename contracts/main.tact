import "@stdlib/deploy";
import "@stdlib/ownable";
import "./deal.tact";
import "./imports/models.tact";

const MIN_GAS_STORAGE: Int = 20000000; // 0.02 TON
const GAS_CREATE_DEAL: Int = 20000000; // 0.02 TON
// const MIN_BET: Int = 1000000000; // 1 TON

message NewDeal {
    arbiter: Address;
    arbiterFee: Int as uint16;
    amount: Int;
    approved: Bool;
}

contract Main with Deployable, Ownable {
    owner: Address;
    fee: Int as uint16; // 1% - 10000

    init(fee: Int) {
        self.owner = sender();
        self.fee = fee;
    }

    receive(msg: NewDeal) {
        let ctx: Context = context();

        let balanceBefore: Int = myBalance() - ctx.value;
        let takeForStorage: Int = MIN_GAS_STORAGE - min(MIN_GAS_STORAGE, balanceBefore);
        let valueSend: Int = ctx.value - takeForStorage - GAS_CREATE_DEAL;
        require(valueSend >= msg.amount, "Insufficient funds");

        let winit: StateInit = initOf Deal(myAddress(), msg.arbiter, msg.arbiterFee, self.fee, now());
        send(SendParameters{
            to: contractAddress(winit), 
            value: 0, 
            bounce: false,
            mode: SendRemainingValue,
            body: CreateDeal{
                from: ctx.sender,
                amount: msg.amount,
                approved: msg.approved
            }.toCell(),
            code: winit.code,
            data: winit.data
        });
    }
}

