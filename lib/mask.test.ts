import { digitsOf, formatIndianPhone, maskPhone } from "./mask";

it("groups an Indian mobile the way Indians write it", () => {
  expect(formatIndianPhone("")).toBe("");
  expect(formatIndianPhone("98")).toBe("98");
  expect(formatIndianPhone("98765")).toBe("98765");
  expect(formatIndianPhone("987654")).toBe("98765 4");
  expect(formatIndianPhone("9876543210")).toBe("98765 43210");
  expect(formatIndianPhone("98765432109999")).toBe("98765 43210");
});

it("takes a prefix off only when what is left is a whole number", () => {
  expect(digitsOf("+91 98765 43210")).toBe("9876543210");
  expect(digitsOf("09876543210")).toBe("9876543210");
  expect(digitsOf("98765 43210")).toBe("9876543210");
  // 9176543210 is itself a legal Indian mobile; its 91 is not a country code
  expect(digitsOf("9176543210")).toBe("9176543210");
});

it("never re-eats the country code, because it is not in the field", () => {
  // the bug that made the first version unusable: type one digit and watch
  // it become three
  expect(maskPhone("", "9")).toBe("9");
  expect(maskPhone("9", "98")).toBe("98");
});

it("backspacing a literal eats the digit behind it", () => {
  // the platform removed a real digit: nothing special to do
  expect(maskPhone("98765 4", "98765 ")).toBe("98765");
  // and now backspace lands on the space: same digits, shorter text
  expect(maskPhone("98765 ", "98765")).toBe("9876");
});

it("survives a paste of a fully formatted number", () => {
  expect(maskPhone("", "+91 98765 43210")).toBe("98765 43210");
  expect(maskPhone("", "09876543210")).toBe("98765 43210");
});
