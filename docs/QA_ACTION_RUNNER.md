# QA Checklist: Action Runner

## Plan Generation
- [ ] Enter a natural-language instruction and click **Preview Plan**.
- [ ] Confirm the JSON plan is well-formed and under max action count.

## Approvals
- [ ] Run a plan that includes a new domain and confirm approval is required.
- [ ] Approve the request and confirm the run begins.

## Execution + Artifacts
- [ ] Run a plan that captures a screenshot and extractText.
- [ ] Verify artifacts appear in `data/action_runs/<runId>/`.
- [ ] Verify the UI shows timeline updates and images.

## Desktop Runner
- [ ] Switch to **Desktop** mode in Action Runner.
- [ ] Load the sample plan or create a simple plan.
- [ ] Confirm approval is required before execution.
- [ ] Toggle **Approval mode = Per step** and confirm a step-level approval appears.
- [ ] Approve the step and confirm the run continues.
- [ ] Click **Panic Stop** and confirm the run status becomes `stopping`/`stopped`.
- [ ] Verify artifacts appear in `data/desktop_runs/<runId>/`.
- [ ] Run a plan with `visionOcr` and confirm an OCR text artifact is created.
- [ ] Run a plan with `uiaClick` and confirm UI Automation steps execute.

## Desktop Macro Recorder
- [ ] Open **Action Runner → Desktop** and start a recording.
- [ ] Press the stop key (default `F8`) to finish recording.
- [ ] Save the macro and confirm it appears in the Saved Macros list.
- [ ] Run the macro and confirm approvals and artifacts work as expected.

## Teach Mode
- [ ] Create a macro with a parameter placeholder like `{{email}}`.
- [ ] Save and re-run the macro with a parameter value.
- [ ] Create a **Desktop** macro with `launch` + `type` + `screenshot`.
- [ ] Run the desktop macro and confirm approvals + artifacts.

## Pairing + Messaging
- [ ] Send a message from an unknown Telegram/Slack/Discord sender.
- [ ] Confirm a pairing code is returned and the message is not processed.
- [ ] Approve pairing in Connections → Pairing Requests.
- [ ] Confirm messages are now processed and responses are sent.
