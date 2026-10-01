# Migration Guide: @0xsquid/widget v5.4.0 → v6.4.0

## Current Implementation Analysis

### APIs Currently Used:
1. **Component Import**: `SquidWidget` from `@0xsquid/widget`
2. **Config Props**:
   - `integratorId`: string
   - `apiUrl`: string
   - `collectFees`: object with `integratorAddress` and `fee`
   - `themeType`: 'dark' | 'light'
   - `theme`: object with color and boxShadow overrides
3. **Component Props**:
   - `config`: object (squidConfig)
   - `className`: string

## Potential Breaking Changes (v5 → v6)

### 1. **Config Structure Changes**
   - **Check**: Verify if `collectFees` structure changed
   - **Action**: Test fee collection still works after update
   - **Risk**: Medium

### 2. **Theme API Changes**
   - **Check**: Verify theme color keys and structure
   - **Action**: Test dark/light theme switching
   - **Risk**: Medium (we use custom theme overrides)

### 3. **Component Export Changes**
   - **Check**: Verify `SquidWidget` is still the default/named export
   - **Action**: Our dynamic import should handle this gracefully
   - **Risk**: Low (we have error handling)

### 4. **Initialization Error Fix**
   - **Expected**: v6.4.0 may have fixed the `SquidMainWidget` initialization error
   - **Action**: Remove error suppression code if error is gone
   - **Risk**: Low (our error handlers are defensive)

### 5. **TypeScript Types**
   - **Check**: Type definitions may have changed
   - **Action**: Update `config: any` to proper types if available
   - **Risk**: Low (we use `any` currently)

## Migration Checklist

### Before Update:
- [x] Document current config structure
- [x] Note all props being used
- [x] Identify error handling patterns

### After Update:
- [ ] Test widget loads without initialization errors
- [ ] Verify theme switching (dark/light) works
- [ ] Test fee collection functionality
- [ ] Check console for deprecation warnings
- [ ] Verify all config options still work
- [ ] Test on different browsers
- [ ] Remove error suppression code if initialization error is fixed

## Code Changes Needed (If Any)

### If initialization error is fixed:
Remove from `SquidWidgetWrapper.tsx`:
```typescript
// Remove global error handlers (lines 75-116) if error is gone
```

### If config structure changed:
Update `BridgeComponent.tsx`:
```typescript
// Update baseSquidConfigRef structure if needed
```

### If theme API changed:
Update `themeOverrides` in `BridgeComponent.tsx`:
```typescript
// Update color keys and structure if theme API changed
```

## Testing Plan

1. **Basic Functionality**:
   - Widget loads and displays
   - Can select source/destination chains
   - Can input amounts
   - Can connect wallet

2. **Theme Testing**:
   - Switch between dark/light themes
   - Verify custom colors apply correctly
   - Check widget styling matches design

3. **Error Handling**:
   - Test with slow network
   - Test with invalid config
   - Verify error boundaries catch issues

4. **Fee Collection**:
   - Verify fees are collected correctly
   - Check integrator address is used
   - Confirm fee percentage is correct

## Rollback Plan

If issues occur:
1. Revert to v5.4.0: `pnpm install @0xsquid/widget@5.4.0`
2. Keep error handling code in place
3. Report issues to Squid Router team

## Notes

- The initialization error (`SquidMainWidget` before initialization) is likely fixed in v6
- Major version bump (v5 → v6) suggests potential breaking changes
- Our defensive error handling should catch most issues
- Test thoroughly before deploying to production

