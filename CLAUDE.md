# BiuBiu Tools - Development Guidelines

## Design Style (Apple-inspired)

Follow these core design principles:

1. **Minimalism** - Remove unnecessary decorations, keep it clean
2. **Soft shadows** - Use natural, diffused shadows instead of hard edges or glow effects
3. **Subtle transitions** - Hover effects should be restrained (max 2px translate)
4. **Clean backgrounds** - Simple semi-transparent colors, avoid complex gradients
5. **Refined borders** - Thin, low-contrast borders

### CSS Examples

```css
/* Good - Apple style */
.card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

/* Avoid - Too flashy */
.card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%);
  box-shadow: 0 0 60px rgba(54, 160, 122, 0.15), 0 16px 48px rgba(0, 0, 0, 0.4);
}
```

### Animation Guidelines

- No pulse/glow animations
- Keep hover transforms minimal (1-2px)
- Prefer opacity and subtle scale changes over dramatic effects
