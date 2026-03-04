import mongoose from "mongoose";

const registrationSchema = new mongoose.Schema(
{
childFullName: String,
birthDate: String,
ageGroup: String,

childId: String,

motherName: String,
motherPhone: String,

fatherName: String,
fatherPhone: String,

stayUntil: String,
address: String,

hasAllergy: String,
allergyDetails: String,

hasDisease: String,
diseaseDetails: String,

notes: String,

status: { type: String, default: "new" },

receiptUrl: String,
receiptUploadedAt: String,

approvedNotifiedAt: String,
rejectedNotifiedAt: String,

promotedAt: String,
},
{ timestamps: true }
);

registrationSchema.set("toJSON", {
transform: (_, ret) => {
ret.id = ret._id.toString();
delete ret._id;
delete ret.__v;
return ret;
},
});

export default mongoose.model("Registration", registrationSchema);