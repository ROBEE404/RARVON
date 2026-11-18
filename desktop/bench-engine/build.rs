// Puts Bench's icon and file details into the Windows program.
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        embed_resource::compile("bench.rc", embed_resource::NONE).manifest_optional().unwrap();
    }
    println!("cargo:rerun-if-changed=bench.rc");
    println!("cargo:rerun-if-changed=bench.ico");
}
