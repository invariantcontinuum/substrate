pub fn greet() {
    println!("hello");
}

pub struct Greeter;

impl Greeter {
    pub fn greet(&self) {
        greet();
    }
}
