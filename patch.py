with open("crates/ecash-wallet/src/lib.rs", "r") as f:
    lines = f.readlines()

start = -1
end = -1
for i, line in enumerate(lines):
    if line.startswith("pub async fn issue_multimint_note<F, Fut>("):
        start = i
    if line.startswith("pub async fn reconstruct_token("):
        end = i
        break

if start != -1 and end != -1:
    with open("scratch_issue.rs", "r") as sf:
        scratch = sf.readlines()
    
    new_lines = lines[:start] + scratch + ["\n"] + lines[end:]
    with open("crates/ecash-wallet/src/lib.rs", "w") as f:
        f.writelines(new_lines)
    print("Patched successfully")
else:
    print("Could not find boundaries")
