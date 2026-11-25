import { hasReceivedInstitutionProposal } from "../../shared/institutionProposalPresentation";
describe("proposal display",()=>{
  it("never presents a placeholder or unrecorded amount as an actual received proposal",()=>{
    expect(hasReceivedInstitutionProposal({institutionProposal:{}})).toBe(false);
    expect(hasReceivedInstitutionProposal({institutionProposal:{approvedAmount:100}})).toBe(false);
    expect(hasReceivedInstitutionProposal({institutionProposal:{approvedAmount:0},proposalReceivedAt:"2026-11-25"})).toBe(false);
    expect(hasReceivedInstitutionProposal({institutionProposal:{approvedAmount:"100.00"},proposalReceivedAt:"2026-11-25"})).toBe(true);
  });
});
