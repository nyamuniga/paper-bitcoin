use ecash_core::dhke::{verify_dleq, point_from_hex};
use ecash_core::types::Dleq;
fn main() {
    let mint_pk_8 = point_from_hex("027df3692e3d4e026b0eebbea0cbc09d7c954f73afcfea754e2859ee332a3cf945").unwrap();
    let c_prime_8 = point_from_hex("037757eba2c9622334ef37ab0d3068523d4cfed3229a6611306c73b6902855db93").unwrap();
    let dleq = Dleq {
        e: "53b68228780bb50e7a22fa9ae326d4d55c5d93d6f486e29ea95c7c5fd237f306".to_string(),
        s: "a7442e2f962b2ff328f42cecd0e8a24981d37b69f0caaef153059706c19413f1".to_string(),
    };

    let b_primes = vec![
        ("1", "03d981ed93f3fa1f4bb6eba86e3fee5c1b3b490c07726b64586a39309efb6acc76"),
        ("2", "0252d561c5266641e944182fb559a9b363386f2678204eceacf25c39d8075dcc14"),
        ("4", "03194243a1f5fe65752e43babcae9e8f61cdb2bee03f2b6db6472b6bfb70b361ca"),
        ("8", "03da5884a821a993da6ec9070b20467b289db58d2e9a7f549cb6b5921b1d6a7614"),
    ];

    for (amt, b) in &b_primes {
        let b_point = point_from_hex(b).unwrap();
        let res = verify_dleq(&mint_pk_8, &c_prime_8, &b_point, &dleq);
        println!("Test C_8 with B_{}: {}", amt, res);
    }
}
