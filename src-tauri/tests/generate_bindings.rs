//! Writes `src/bindings.ts` by driving the same tauri-specta Builder the
//! runtime uses. This test exists so `cargo test` regenerates bindings on
//! demand without spinning up the Tauri window, and so CI can verify the
//! checked-in file is fresh by running this test and `git diff --exit-code`.

use specta_typescript::{BigIntExportBehavior, Typescript};

#[test]
fn generates_typescript_bindings() {
    // Our IDs are sqlx i64 but never exceed 2^53 in practice (this is a
    // personal-scale tracker), so emit them as plain `number` in TS to
    // match the hand-written types we're replacing. Without this,
    // specta errors out on BigIntForbidden for every i64 field.
    //
    // The ts-nocheck header is a workaround for three known issues in
    // specta-typescript 0.0.9's generator output under our strict tsconfig:
    // an unused TSend generic on the TAURI_CHANNEL placeholder, a name
    // collision between that placeholder and the `Channel as TAURI_CHANNEL`
    // import, and an unused __makeEvents__ helper. None affects the
    // exported type surface — consumers still get full type checking at
    // use sites — so suppressing tsc inside the generated file is the
    // pragmatic call.
    let ts = Typescript::default()
        .bigint(BigIntExportBehavior::Number)
        .header("// @ts-nocheck\n");

    shows_lib::make_specta_builder()
        .export(ts, "../src/bindings.ts")
        .expect("failed to export typescript bindings");
}
