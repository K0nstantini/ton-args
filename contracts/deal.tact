import "@stdlib/deploy";
import "@stdlib/ownable";
import "./imports/models.tact";

message AddUser {
    amount: Int;
    approved: Bool;
}

struct User {
    amount: Int;
    approved: Bool;
    refused: Bool;
}

struct DealInfo {
    arbiter: Address;
    arbiterFee: Int;
    mainFee: Int;
    approved: Bool;
}

contract Deal with Deployable, Ownable {
    owner: Address;
    arbiter: Address;
    arbiterFee: Int as uint16;
    mainFee: Int as uint16;
    approved: Bool;
    seed: Int;

    users: map<Address, User>;
    countUsers: Int as uint16;
    usersAmount: Int;
    usersApproved: Int as uint16;
    usersRefused: Int as uint16;

    init(owner: Address, arbiter: Address, arbiterFee: Int, mainFee: Int, seed: Int) {
        self.owner = owner;
        self.arbiter = arbiter;
        self.arbiterFee = arbiterFee;
        self.mainFee = mainFee;
        self.seed = seed;
        self.approved = false;
        self.countUsers = 0;
        self.usersAmount = 0;
        self.usersApproved = 0;
        self.usersRefused = 0;
    }

    receive(msg: CreateDeal) {
        self.requireOwner();
        self.add_user(msg.from, msg.amount, msg.approved, false);
        send(SendParameters{
            to: msg.from,
            value: 0, 
            bounce: false,
            mode: SendIgnoreErrors,
            body: "Deal created!".asComment()
        });
    }

    receive(msg: AddUser) {
        require(!self.approved, "Deal closed for changing");
        let sender: Address = context().sender;
        let user: User? = self.users.get(sender);

        if (user == null) {
            self.add_user(sender, msg.amount, msg.approved, false);
        } else {
            self.change_user(user!!, sender, msg.amount, msg.approved, false);
        }
    }

    receive("approve") {
        let sender: Address = context().sender;
        let user: User? = self.users.get(sender);
        require(user != null, "Unknown participant");

        self.change_user(user!!, sender, 0, true, false);
    }

    receive("refuse") {
        let sender: Address = context().sender;
        let usr: User? = self.users.get(sender);
        require(usr != null, "Unknown participant");
        let user: User  = usr!!;

        self.change_user(user, sender, 0, false, true);

        if (!self.approved) {
            self.send_to_user(sender, user.amount.sub_fee(self.mainFee));
            self.remove_user(user, sender);
            if (self.countUsers == 0) {
                // send to owner
            }
        }
    }


    fun add_user(addr: Address, amount: Int, approved: Bool, refused: Bool) {
        self.users.set(addr, User{
            amount: amount,
            approved: approved,
            refused: refused
        });

        if (approved) {
            self.usersApproved += 1;
        }
        if (refused) {
            self.usersRefused += 1;
        }
        self.countUsers += 1;
        self.usersAmount += amount;
    }

    fun change_user(user: User, addr: Address, add_amount: Int, approved: Bool, refused: Bool) {
        self.users.set(addr, User{
            amount: user.amount + add_amount,
            approved: approved,
            refused: refused
        });

        if (!user.approved && approved) {
            self.usersApproved += 1;
        } else if (user.approved && !approved) {
            self.usersApproved -= 1;
        }

        if (!user.refused && refused) {
            self.usersRefused += 1;
        } else if (user.refused && !refused) {
            self.usersRefused -= 1;
        }

        if (self.usersRefused == self.countUsers) {
            self.approved = false;
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

        if (user.approved) {
            self.usersApproved -= 1;
        }
        if (user.refused) {
            self.usersRefused -= 1;
        }
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
            mode: SendRemainingBalance | SendDestroyIfZero
        });

    }


    // get methods

    get fun get_participants(): map<Address, User> {
        return self.users;
    }

    get fun get_info(): DealInfo {
        return DealInfo{
            arbiter: self.arbiter,
            arbiterFee: self.arbiterFee,
            mainFee: self.mainFee,
            approved: self.approved
        };
    }

}

extends fun sub_fee(self: Int, fee: Int): Int {
    return self * fee / 1000000;
}
