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
- [ ] Verify artifacts appear in `data/desktop_runs/<runId>/`.

## Teach Mode
- [ ] Create a macro with a parameter placeholder like `{{email}}`.
- [ ] Save and re-run the macro with a parameter value.

## Pairing + Messaging
- [ ] Send a message from an unknown Telegram/Slack/Discord sender.
- [ ] Confirm a pairing code is returned and the message is not processed.
- [ ] Approve pairing in Connections → Pairing Requests.
- [ ] Confirm messages are now processed and responses are sent.
