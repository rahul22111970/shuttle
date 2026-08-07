import { parseIndianPhone } from "./phone";

it.each([
  ["9876543210", "+919876543210"],
  ["+91 98765 43210", "+919876543210"],
  ["919876543210", "+919876543210"],
  ["09876543210", "+919876543210"],
  ["98765-43210", "+919876543210"],
  ["6000000000", "+916000000000"],
])("parses %s", (input, expected) => {
  expect(parseIndianPhone(input)).toBe(expected);
});

it.each([
  [""],
  ["hello"],
  ["12345"],
  ["5876543210"], // mobiles start 6-9
  ["98765432101"], // 11 digits
  ["987654321"], // 9 digits
  ["+1 555 000 1234"], // not India
  ["98765x3210"],
])("rejects %s", (input) => {
  expect(parseIndianPhone(input)).toBeNull();
});
