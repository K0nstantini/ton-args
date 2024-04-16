import "@stdlib/deploy";
import "@stdlib/ownable";
import "./imports/models.tact";

@name(muldiv)
native muldiv(a: Int, b: Int, c: Int): Int;

message AddUser {
    amount: Int as coins;
    approved: Bool;
}

message Reward {
    addr: Address;
}

struct User {
    addr: Address;
    amount: Int as coins;
    approved: Int;
    refused: Bool;
}

struct DealInfo {
    arbiter: Address;
    arbiterFee: Int;
    mainFee: Int;
    approved: Bool;
    draw: Bool;
    lastCancel: Int;
    participants: map<Address, User>;
}

contract Deal with Deployable, Ownable {
    owner: Address;
    arbiter: Address;
    arbiterFee: Int as uint16;
    mainFee: Int as uint16;
    lastApproved: Int;
    approved: Bool;
    draw: Bool;
    lastCancel: Int;
    seed: Int;

    users: map<Address, User>;
    countUsers: Int as uint16;
    usersAmount: Int as coins;
    usersApproved: Int as uint16;
    usersRefused: Int as uint16;

    init(owner: Address, arbiter: Address, arbiterFee: Int, mainFee: Int, seed: Int) {
        self.owner = owner;
        self.arbiter = arbiter;
        self.arbiterFee = arbiterFee;
        self.mainFee = mainFee;
        self.seed = seed;
        self.approved = false;
        self.lastApproved = 0;
        self.lastCancel = 0;
        self.draw = false;
        self.countUsers = 0;
        self.usersAmount = 0;
        self.usersApproved = 0;
        self.usersRefused = 0;
    }

    receive(msg: CreateDeal) {
        self.requireOwner();
        self.add_user(msg.from, msg.amount, 0, false);
        send(SendParameters{
            to: msg.from,
            value: ton("0.005"), 
            bounce: false,
            mode: SendIgnoreErrors,
            body: "Deal created!".asComment()
        });
    }

    receive(msg: AddUser) {
        let ctx: Context = context();
        require(!self.draw, "Deal closed");
        require(ctx.value >= msg.amount, "Insufficient funds"); // add fee

        let user: User? = self.users.get(ctx.sender);

        if (user == null) {
            let approved: Int = (msg.approved && self.countUsers > 0) ? self.inc_and_get_next_approved() : 0;
            self.add_user(ctx.sender, msg.amount, approved, false);
        } else {
            let approved: Int = (msg.approved && self.countUsers > 1) ? self.inc_and_get_next_approved() : 0;
            self.change_user(user!!, msg.amount, approved, false);
        }
    }

    receive("approve") {
        require(!self.draw, "Deal closed");
        let sender: Address = context().sender;
        let user: User? = self.users.get(sender);
        require(user != null, "Unknown participant");

        self.change_user(user!!, 0, self.inc_and_get_next_approved(), false);
    }

    receive("withdraw") {
        let sender: Address = context().sender;
        let usr: User? = self.users.get(sender);
        require(usr != null, "Unknown participant");
        let user: User  = usr!!;

        self.change_user(user, 0, 0, true);

        if (!self.approved || self.draw) {
            if (self.draw) {
                let arbiterFee: Int = self.usersAmount.get_fee(self.arbiterFee);
                let sumWithArbiterFee: Int = self.usersAmount - arbiterFee;
                let sumWithAllFee: Int  = sumWithArbiterFee - sumWithArbiterFee.get_fee(self.mainFee);
                self.send_to_user(sender, sumWithAllFee);
                self.send_to_user(self.arbiter, arbiterFee);

            } else {
                let sum: Int = user.amount - user.amount.get_fee(self.mainFee);
                self.send_to_user(sender, sum); 
                self.lastCancel = self.inc_and_get_next_approved();
                self.usersApproved = 0;
            }
            self.remove_user(user, sender);
            if (self.countUsers == 0) {
                self.send_to_owner();
            }
        }
    }

    receive(msg: Reward) {
        require(self.arbiter == context().sender, "Access denied");
        require(self.approved, "The deal is not completed");
        require(!self.draw, "The deal is already completed");

        if (self.users.get(msg.addr) == null) {
            self.draw = true;
        } else {
            let arbiterFee: Int = self.usersAmount.get_fee(self.arbiterFee);
            let sumWithArbiterFee: Int = self.usersAmount - arbiterFee;
            let sumWithAllFee: Int  = sumWithArbiterFee - sumWithArbiterFee.get_fee(self.mainFee);

            self.send_to_user(msg.addr, sumWithAllFee);
            self.send_to_user(self.arbiter, arbiterFee);
            self.send_to_owner();
        }
    }

    fun add_user(addr: Address, amount: Int, approved: Int, refused: Bool) {
        self.users.set(addr, User{
            addr: addr,
            amount: amount,
            approved: approved,
            refused: refused
        });

        if (approved > 0) {
            self.usersApproved += 1;
        }
        if (refused) {
            self.usersRefused += 1;
        }
        self.countUsers += 1;
        self.usersAmount += amount;
    }

    fun change_user(user: User, add_amount: Int, approved: Int, refused: Bool) {
        self.users.set(user.addr, User{
            addr: user.addr,
            amount: user.amount + add_amount,
            approved: approved,
            refused: refused
        });

        if (user.approved == 0 && approved > 0) {
            self.usersApproved += 1;
        } else if (user.approved > 0 && user.approved >= self.lastApproved && approved == 0) {
            self.usersApproved -= 1;
        }

        if (!user.refused && refused) {
            self.usersRefused += 1;
        } else if (user.refused && !refused) {
            self.usersRefused -= 1;
        }

        if (self.countUsers > 1 && self.usersApproved == self.countUsers) {
            self.approved = true;
        }

        self.usersAmount += add_amount; // only adding possible

    }

    fun remove_user(user: User, addr: Address) {
        self.users.set(addr, null);
        self.countUsers -= 1;
        self.usersAmount -= user.amount;

        if (user.approved > 0 && user.approved >= self.lastApproved) {
            self.usersApproved -= 1;
        }
        if (user.refused) {
            self.usersRefused -= 1;
        }
    }

    fun inc_and_get_next_approved(): Int {
        self.lastApproved += 1;
        return self.lastApproved;
    }

    fun send_to_user(addr: Address, amount: Int) {
        send(SendParameters{
            to: addr,
            value: amount, 
            bounce: false,
            mode: SendPayGasSeparately | SendIgnoreErrors
        });

    }

    fun send_to_owner() {
        send(SendParameters{
            to: self.owner,
            value: 0, 
            bounce: false,
            mode: SendRemainingBalance | SendDestroyIfZero,
            body: "reward".asComment()
        });

    }

    // TODO: del
    // get fun get_participants(): map<Address, User> {
    //     return self.users;
    // }

    get fun get_info(): DealInfo {
        return DealInfo{
            arbiter: self.arbiter,
            arbiterFee: self.arbiterFee,
            mainFee: self.mainFee,
            approved: self.approved,
            draw: self.draw,
            lastCancel: self.lastCancel,
            participants: self.users
        };
    }

}

extends fun get_fee(self: Int, fee: Int): Int {
    return muldiv(self, fee, 1000000);
}
