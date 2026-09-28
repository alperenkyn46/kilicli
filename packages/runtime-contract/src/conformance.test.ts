import { createMockConformanceHarness } from "./mock.js";
import { defineRuntimeAdapterConformance } from "./conformance.js";

defineRuntimeAdapterConformance("mock", () => createMockConformanceHarness());
